// app.js

const SUELDO_BASE_GARANTIZADO = 483.00; 

// --- Variables Globales Locales ---
let currentHolidays = []; // Array para almacenar las fechas feriadas (formato YYYY-MM-DD)
let currentShifts = [];   // Array para almacenar los datos de turno
let currentTotals = { subtotalCalculated: 0, totalIngresos: 0 };
window.shiftsExportData = []; // Para la exportación

// --- UTILIDADES LOCALSTORAGE ---

const STORAGE_KEYS = {
    SHIFTS: 'payroll_shifts',
    HOLIDAYS: 'payroll_holidays',
    RATE: 'payroll_rate'
};

/** Carga los datos desde localStorage */
const loadData = () => {
    try {
        // Cargar turnos
        const loadedShifts = JSON.parse(localStorage.getItem(STORAGE_KEYS.SHIFTS) || '[]');
        
        // Cargar feriados
        currentHolidays = JSON.parse(localStorage.getItem(STORAGE_KEYS.HOLIDAYS) || '[]');
        
        // Cargar tasa horaria
        const savedRate = localStorage.getItem(STORAGE_KEYS.RATE);
        if (savedRate) {
            document.getElementById('hourly-rate').value = savedRate;
        }

        // Convertir las fechas de turno a objetos Date para ordenamiento
        currentShifts = loadedShifts.map(shift => ({
            ...shift,
            date: new Date(shift.date)
        }));
        
        // Ordenar los turnos por fecha descendente
        currentShifts.sort((a, b) => b.date.getTime() - a.date.getTime());

        // Re-renderizar todo
        renderHolidays();
        renderShifts(currentShifts, currentHolidays);

    } catch (e) {
        console.error("Error al cargar datos de localStorage:", e);
        // En caso de error, inicializar vacíos
        currentShifts = [];
        currentHolidays = [];
    }
};

/** Guarda los datos de turnos y feriados en localStorage */
const saveData = (type) => {
    if (type === 'shifts' || type === 'all') {
        // Almacenar solo la representación en string de la fecha para serialización
        const serializableShifts = currentShifts.map(shift => ({
            ...shift,
            date: shift.date.toISOString().split('T')[0] // Guardar como YYYY-MM-DD
        }));
        localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(serializableShifts));
    }
    if (type === 'holidays' || type === 'all') {
        localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(currentHolidays));
    }
    // Siempre guardar la tasa horaria
    localStorage.setItem(STORAGE_KEYS.RATE, document.getElementById('hourly-rate').value);
    
    // Forzar el re-render para reflejar los cambios y cálculos
    renderShifts(currentShifts, currentHolidays);
};


// =========================================================================
//                             LÓGICA DE CÁLCULO
// =========================================================================

/** Calcula las horas nocturnas (22:00 a 06:00) dentro de un turno. */
const calculateNightHours = (startTimeStr, endTimeStr) => {
    const NIGHT_START = 22; 
    const NIGHT_END = 6;    
    let start = new Date();
    let end = new Date();
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    start.setHours(startH, startM, 0, 0);
    end.setHours(endH, endM, 0, 0);
    if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
    }
    let nightHours = 0;
    let currentTime = new Date(start.getTime());
    while (currentTime.getTime() < end.getTime()) {
        let currentHour = currentTime.getHours();
        let nextTime = new Date(currentTime.getTime());
        nextTime.setMinutes(currentTime.getMinutes() + 1); 
        if (nextTime.getTime() > end.getTime()) {
            nextTime = end;
        }
        const durationInMinutes = (nextTime.getTime() - currentTime.getTime()) / 60000;
        const isNight = (currentHour >= NIGHT_START && currentHour <= 23) || (currentHour >= 0 && currentHour < NIGHT_END);
        if (isNight) {
            nightHours += durationInMinutes / 60;
        }
        currentTime = nextTime;
    }
    return Math.max(0, nightHours);
};

/** Calcula todos los valores de un turno. */
const calculateShift = (shiftDateStr, startTimeStr, endTimeStr, rate, holidayDates) => {
    rate = parseFloat(rate);
    if (isNaN(rate) || !startTimeStr || !endTimeStr) {
        return { totalHours: 0, normalHours: 0, extra50: 0, extra100: 0, nightHours: 0, totalDailyPay: 0, isHoliday: false };
    }
    
    let start = new Date();
    let end = new Date();
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    start.setHours(startH, startM, 0, 0);
    end.setHours(endH, endM, 0, 0);
    if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
    }
    
    const totalHoursRaw = (end.getTime() - start.getTime()) / (1000 * 60 * 60); 
    
    const UNPAID_BREAK_HOURS = 0.5;
    const totalHours = Math.max(0, totalHoursRaw - UNPAID_BREAK_HOURS); 
    
    const normalHours = Math.min(totalHours, 8); 
    const extra50Hours = totalHours > 8 ? Math.min(totalHours - 8, 2) : 0; 
    const extra100Hours = totalHours > 10 ? totalHours - 10 : 0; 
    const nightHours = calculateNightHours(startTimeStr, endTimeStr); 

    const basePay = totalHours * rate; 
    const extra50Surcharge = extra50Hours * rate * 0.5;            
    const extra100Surcharge = extra100Hours * rate * 1.0;            
    const nightSurcharge = nightHours * rate * 0.25; 
    const isHoliday = holidayDates.includes(shiftDateStr);
    let holidaySurcharge = 0;

    if (isHoliday) {
        holidaySurcharge = totalHours * rate * 1.0; 
    }
    
    const totalSurchargesOnly = extra50Surcharge + extra100Surcharge + nightSurcharge + holidaySurcharge;
    const totalDailyPay = basePay + totalSurchargesOnly; 
    
    return {
        totalHours: totalHours, 
        normalHours: normalHours,
        extra50: extra50Hours,
        extra100: extra100Hours,
        nightHours: nightHours,
        totalSurchargesOnly: totalSurchargesOnly, 
        totalDailyPay: totalDailyPay, 
        isHoliday: isHoliday,
    };
};

// =========================================================================
//                             LÓGICA DE UI Y CRUD LOCAL
// =========================================================================

/** Renderiza la tabla de turnos y los totales. */
const renderShifts = (shifts, holidayDates) => {
    const tableBody = document.getElementById('shifts-body');
    const totalRow = document.getElementById('totals-row');
    const tfoot = document.querySelector('tfoot');
    tableBody.innerHTML = '';
    
    let totalDailyPaySum = 0; 
    const rate = parseFloat(document.getElementById('hourly-rate').value) || 0;
    window.shiftsExportData = [];
    
    if (shifts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-8 text-gray-400">
                    Aún no has agregado turnos. ¡Usa el formulario de arriba!
                </td>
            </tr>
        `;
    }

    shifts.forEach(shift => {
        // Asegúrate de que shift.date sea un objeto Date
        const shiftDateObj = shift.date instanceof Date ? shift.date : new Date(shift.date);
        const shiftDateStr = shiftDateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        const dateDisplay = shiftDateObj.toLocaleDateString('es-ES', { year: 'numeric', month: 'numeric', day: 'numeric' });
        
        const calc = calculateShift(shiftDateStr, shift.startTime, shift.endTime, rate, holidayDates);
        
        totalDailyPaySum += calc.totalDailyPay; 

        const isHolidayStyle = calc.isHoliday ? 'bg-red-50 ring-2 ring-red-300' : '';

        const row = `
            <tr class="hover:bg-gray-50 border-b ${isHolidayStyle}">
                <td class="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 z-10 bg-white ${isHolidayStyle}">
                    ${dateDisplay} ${calc.isHoliday ? '<span class="text-red-600 font-bold ml-1 text-xs">FERIADO</span>' : ''}
                </td>
                <td class="px-2 py-2 whitespace-nowrap text-sm text-gray-500">${shift.startTime}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm text-gray-500">${shift.endTime}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm font-semibold text-blue-600">${calc.totalHours.toFixed(2)}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm text-gray-700">${calc.normalHours.toFixed(2)}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm text-orange-600">${calc.extra50.toFixed(2)}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm text-red-600">${calc.extra100.toFixed(2)}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm text-purple-600">${calc.nightHours.toFixed(2)}</td>
                <td class="px-2 py-2 whitespace-nowrap text-sm font-bold text-green-700" title="Recargos/Extras: $${calc.totalSurchargesOnly.toFixed(2)}">
                    $${calc.totalDailyPay.toFixed(2)}
                </td>
                <td class="px-2 py-2 whitespace-nowrap text-right">
                    <button onclick="window.deleteShift('${shift.id}')" class="text-red-500 hover:text-red-700 transition duration-150">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 6h6v10H7V6z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);

        // Preparar datos para exportación (Datos brutos/pre-calculados)
        window.shiftsExportData.push({
            "Fecha": dateDisplay,
            "Inicio (C2)": shift.startTime,
            "Fin (D2)": shift.endTime,
            "Total Horas Pagadas (E2)": calc.totalHours.toFixed(4),
            "Normales (F2)": calc.normalHours.toFixed(4),
            "Extras 50% (G2)": calc.extra50.toFixed(4),
            "Extras 100% (H2)": calc.extra100.toFixed(4),
            "Nocturnas (I2)": calc.nightHours.toFixed(4),
            "Pago Total Diario (O2)": calc.totalDailyPay.toFixed(4),
            "Recargos/Extras SOLAMENTE": calc.totalSurchargesOnly.toFixed(4),
            "Es Feriado": calc.isHoliday ? "SI" : "NO",
        });
    });
    
    // Actualizar totales
    currentTotals.subtotalCalculated = totalDailyPaySum;
    currentTotals.totalIngresos = Math.max(SUELDO_BASE_GARANTIZADO, totalDailyPaySum);

    // Renderizar totales
    totalRow.innerHTML = `
        <td colspan="8" class="px-2 py-3 text-right text-base font-bold text-gray-900">SUBTOTAL HORAS CALCULADAS (PAGO BASE + RECARGOS):</td>
        <td class="px-2 py-3 text-base font-bold text-orange-800">$${currentTotals.subtotalCalculated.toFixed(2)}</td>
        <td class="px-2 py-3"></td>
    `;

    // Renderizar fila de Sueldo Básico Garantizado
    let guaranteedRow = document.getElementById('guaranteed-salary-row');
    if (guaranteedRow) guaranteedRow.remove();
    guaranteedRow = document.createElement('tr');
    guaranteedRow.id = 'guaranteed-salary-row';
    guaranteedRow.className = 'font-bold bg-green-100 border-t-2 border-green-300';
    guaranteedRow.innerHTML = `
        <td colspan="8" class="px-2 py-3 text-right text-lg font-extrabold text-green-900">SUELDO BÁSICO FIJO (30 DÍAS):</td>
        <td class="px-2 py-3 text-lg font-extrabold text-green-800">$${SUELDO_BASE_GARANTIZADO.toFixed(2)}</td>
        <td class="px-2 py-3"></td>
    `;
    tfoot.appendChild(guaranteedRow);
    
    // Renderizar fila de Total Ingresos
    let finalTotalRow = document.getElementById('final-total-row');
    if (finalTotalRow) finalTotalRow.remove();
    finalTotalRow = document.createElement('tr');
    finalTotalRow.id = 'final-total-row';
    finalTotalRow.className = 'font-bold bg-green-200 border-b-4 border-green-500';
    finalTotalRow.innerHTML = `
        <td colspan="8" class="px-2 py-3 text-right text-xl font-extrabold text-gray-900">TOTAL INGRESOS ESTIMADO (Mayor entre Subtotal y Fijo):</td>
        <td class="px-2 py-3 text-xl font-extrabold text-green-900">$${currentTotals.totalIngresos.toFixed(2)}</td>
        <td class="px-2 py-3"></td>
    `;
    tfoot.appendChild(finalTotalRow);

    document.getElementById('display-rate').textContent = `$${rate.toFixed(4)}`;
};

/** Renderiza la lista de días feriados. */
const renderHolidays = () => {
    const list = document.getElementById('holidays-list');
    list.innerHTML = '';

    if (currentHolidays.length === 0) {
        list.innerHTML = `<li class="text-sm text-gray-500 py-2">No hay días feriados registrados.</li>`;
    }

    currentHolidays.forEach((dateStr, index) => {
        // Usamos el índice como ID temporal para la eliminación local
        const holidayId = index; 
        const dateDisplay = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        
        const item = `
            <li class="flex justify-between items-center bg-gray-50 p-2 rounded-md mb-1">
                <span class="text-sm font-medium text-red-700">${dateDisplay}</span>
                <button onclick="window.deleteHoliday('${holidayId}')" class="text-red-500 hover:text-red-700 transition duration-150 p-1 rounded-full hover:bg-red-100">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 6h6v10H7V6z" clip-rule="evenodd" />
                    </svg>
                </button>
            </li>
        `;
        list.insertAdjacentHTML('beforeend', item);
    });
};


// --- CRUD LOCAL ---

/** Añade un turno a la lista local. */
const addShift = (event) => {
    event.preventDefault();
    const form = event.target;
    const shiftDateStr = form['shift-date'].value;
    const startTime = form['start-time'].value;
    const endTime = form['end-time'].value;
    
    if (!shiftDateStr || !startTime || !endTime) {
        alertUser("Por favor, complete todos los campos de hora y fecha.", "bg-yellow-100 border-yellow-400 text-yellow-700");
        return;
    }

    try {
        const newShift = {
            id: Date.now().toString(), // Generar un ID simple basado en el tiempo
            date: new Date(shiftDateStr + 'T00:00:00'), 
            startTime: startTime,
            endTime: endTime,
        };
        
        currentShifts.push(newShift);
        currentShifts.sort((a, b) => b.date.getTime() - a.date.getTime()); // Reordenar

        saveData('shifts'); // <--- Guarda automáticamente en localStorage
        form.reset();
        document.getElementById('shift-date').value = new Date().toISOString().split('T')[0];
        alertUser("Turno agregado exitosamente.", "bg-green-100 border-green-400 text-green-700");
    } catch (e) {
        console.error("Error al agregar turno local: ", e);
        alertUser(`Error al agregar turno: ${e.message}`, "bg-red-100 border-red-400 text-red-700");
    }
};

/** Elimina un turno de la lista local. */
const deleteShift = (id) => {
    const initialLength = currentShifts.length;
    currentShifts = currentShifts.filter(shift => shift.id !== id);
    
    if (currentShifts.length < initialLength) {
        saveData('shifts'); // <--- Guarda automáticamente en localStorage
        alertUser("Turno eliminado.", "bg-red-100 border-red-400 text-red-700");
    }
};

/** Añade un nuevo día feriado a la lista local. */
const addHoliday = (event) => {
    event.preventDefault();
    const dateInput = document.getElementById('holiday-date-input');
    const holidayDate = dateInput.value;
    
    if (!holidayDate) {
        alertUser("Por favor, ingrese una fecha válida.", "bg-yellow-100 border-yellow-400 text-yellow-700");
        return;
    }

    try {
        if (currentHolidays.includes(holidayDate)) {
            alertUser("Esta fecha ya está registrada como feriado.", "bg-yellow-100 border-yellow-400 text-yellow-700");
            return;
        }

        currentHolidays.push(holidayDate);
        currentHolidays.sort(); // Opcional: ordenar fechas

        saveData('holidays'); // <--- Guarda automáticamente en localStorage
        dateInput.value = '';
        renderHolidays(); // Actualizar lista de feriados
        alertUser("Día feriado agregado exitosamente.", "bg-red-100 border-red-400 text-red-700");
    } catch (e) {
        console.error("Error al agregar feriado: ", e);
        alertUser(`Error al agregar feriado: ${e.message}`, "bg-red-100 border-red-400 text-red-700");
    }
};

/** Elimina un feriado de la lista local. */
const deleteHoliday = (index) => {
    const idx = parseInt(index);
    if (idx >= 0 && idx < currentHolidays.length) {
        currentHolidays.splice(idx, 1);
        saveData('holidays'); // <--- Guarda automáticamente en localStorage
        renderHolidays(); // Actualizar lista de feriados
        alertUser("Día feriado eliminado.", "bg-red-100 border-red-400 text-red-700");
    }
};

/** Genera turnos predeterminados para un mes completo (SOLO 30 DÍAS). */
const generateDefaultShifts = () => {
    const monthYearInput = document.getElementById('month-year-input').value;
    if (!monthYearInput) {
        alertUser("Por favor, seleccione un mes y año.", "bg-yellow-100 border-yellow-400 text-yellow-700");
        return;
    }

    const [yearStr, monthStr] = monthYearInput.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; 
    
    const generateButton = document.getElementById('generate-button');
    const originalButtonText = generateButton.textContent;
    generateButton.disabled = true;
    generateButton.textContent = 'Limpiando turnos anteriores y generando nuevo mes...';
    
    // PASO 1: Limpiar todos los turnos existentes
    currentShifts = [];
    
    // PASO 2: Agregar EXCACTAMENTE 30 turnos
    const shiftsToAdd = [];
    const MAX_DAYS = 30;
    let successfulAdds = 0;
    
    for (let day = 1; day <= MAX_DAYS; day++) {
        const date = new Date(year, month, day);
        if (date.getMonth() !== month) break; 
        
        const dateStr = date.toISOString().split('T')[0];
        shiftsToAdd.push({
            id: `auto_${Date.now()}_${day}`, // ID único
            date: new Date(dateStr + 'T00:00:00'),
            startTime: '08:30',
            endTime: '17:00', // 8.5 horas, 8 horas netas pagadas
        });
        successfulAdds++;
    }
    
    currentShifts = shiftsToAdd;
    currentShifts.sort((a, b) => b.date.getTime() - a.date.getTime()); // Reordenar

    saveData('shifts'); // <--- Guarda automáticamente en localStorage

    alertUser(`Se eliminaron los turnos anteriores y se generaron ${successfulAdds} turnos (30 días) para el nuevo mes.`, "bg-green-100 border-green-400 text-green-700");
    
    generateButton.disabled = false;
    generateButton.textContent = originalButtonText;
};

// =========================================================================
//                             LÓGICA DE EXCEL MEJORADA
// =========================================================================

/**
 * Función para generar las fórmulas de Excel.
 */
const generateExcelFormulaData = (shiftsData, rate) => {
    // Encabezados de las columnas en la Hoja de Fórmulas
    const headers = [
        "Fecha", "Inicio", "Fin", "Total Horas Pagadas (E)", 
        "Normales (F)", "Extras 50% (G)", "Extras 100% (H)", 
        "Nocturnas (I)", "Valor Hora Normal (J)", 
        "Pago Base (K)", "Recargo Extra 50% (L)", 
        "Recargo Extra 100% (M)", "Recargo Nocturno (N)", 
        "Pago Diario (O)", "Es Feriado", "Recargo Feriado (P)"
    ];
    
    const formulaRows = [];
    const tasaHora = parseFloat(rate).toFixed(4);

    shiftsData.forEach((shift, index) => {
        const rowNum = index + 2; // Fila donde empieza esta fila de datos
        
        // Valores planos necesarios
        const date = shift["Fecha"];
        const start = shift["Inicio (C2)"];
        const end = shift["Fin (D2)"];
        const totalHours = parseFloat(shift["Total Horas Pagadas (E2)"]);
        const normalHours = parseFloat(shift["Normales (F2)"]);
        const extra50 = parseFloat(shift["Extras 50% (G2)"]);
        const extra100 = parseFloat(shift["Extras 100% (H2)"]);
        const nightHours = parseFloat(shift["Nocturnas (I2)"]);
        
        // Fórmulas de Excel (simulando referencias de celda)
        const formulaJ = `$${tasaHora}`; 
        const formulaK = `=E${rowNum}*J${rowNum}`; 
        const formulaL = `=G${rowNum}*J${rowNum}*0.5`;
        const formulaM = `=H${rowNum}*J${rowNum}*1`;
        const formulaN = `=I${rowNum}*J${rowNum}*0.25`;
        
        // Columna P (Recargo Feriado) = SI(O16="SI", E * J * 1, 0)
        const formulaP = `=IF(O${rowNum}="SI", E${rowNum}*J${rowNum}*1, 0)`; // Usamos IF en inglés para compatibilidad amplia
        
        // Columna O (Pago Diario Total) = K + L + M + N + P
        const formulaO = `=SUM(K${rowNum}:N${rowNum}, P${rowNum})`; 

        formulaRows.push([
            date, start, end, 
            totalHours, normalHours, extra50, extra100, nightHours, 
            formulaJ, 
            { f: formulaK }, // Exportar como fórmula
            { f: formulaL }, 
            { f: formulaM }, 
            { f: formulaN }, 
            { f: formulaO }, 
            shift["Es Feriado"], 
            { f: formulaP }
        ]);
    });
    
    return { headers, formulaRows, tasaHora };
};


/**
 * Exporta todos los turnos registrados y calculados a un archivo XLSX con formato mejorado y fórmulas.
 */
const exportToExcel = () => {
    if (!window.shiftsExportData || window.shiftsExportData.length === 0) {
        alertUser("No hay datos para exportar. Agregue turnos primero.", "bg-yellow-100 border-yellow-400 text-yellow-700");
        return;
    }

    const rate = document.getElementById('hourly-rate').value;
    const excelData = generateExcelFormulaData(window.shiftsExportData, rate);

    // --- Hoja 1: REPORTE DE NÓMINA (Con Fórmulas y Estilos Vistosos) ---
    
    const ws_detail = XLSX.utils.aoa_to_sheet([excelData.headers, ...excelData.formulaRows]);

    // Formato de Moneda y Horas (requiere estilos complejos en SheetJS)
    const currencyFormat = '$0.00'; 
    const hoursFormat = '0.00';

    // Aplicar formatos a la hoja de detalle de fórmulas
    ['K', 'L', 'M', 'N', 'O', 'P'].forEach(col => {
        for(let i = 2; i <= excelData.formulaRows.length + 1; i++) {
            const cellRef = col + i;
            if(ws_detail[cellRef]) {
                ws_detail[cellRef].z = currencyFormat;
            }
        }
    });

    ['E', 'F', 'G', 'H', 'I'].forEach(col => {
        for(let i = 2; i <= excelData.formulaRows.length + 1; i++) {
            const cellRef = col + i;
            if(ws_detail[cellRef]) {
                ws_detail[cellRef].z = hoursFormat;
            }
        }
    });

    // Anchos de columna
    const wscols = [
        {wch: 12}, {wch: 8}, {wch: 8}, {wch: 10}, {wch: 10}, 
        {wch: 10}, {wch: 10}, {wch: 10}, {wch: 12}, {wch: 12}, 
        {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}
    ];
    ws_detail['!cols'] = wscols;

    // --- Añadir Fila de TOTALES ---
    const totalRowIndex = excelData.formulaRows.length + 2;
    
    ws_detail[`D${totalRowIndex}`] = { v: 'TOTALES:', t: 's', s: { font: { bold: true } } };
    
    // Suma de Horas (E, F, G, H, I)
    ['E', 'F', 'G', 'H', 'I'].forEach(col => {
        const cellRef = col + totalRowIndex;
        ws_detail[cellRef] = { 
            f: `SUMA(${col}2:${col}${totalRowIndex - 1})`, 
            t: 'n', 
            z: hoursFormat,
            s: { font: { bold: true }, fill: { fgColor: { rgb: "FFFFD700" } } } // Fondo amarillo
        };
    });
    
    // Suma de Pagos y Recargos (K, L, M, N, O, P)
    ['K', 'L', 'M', 'N', 'O', 'P'].forEach(col => {
        const cellRef = col + totalRowIndex;
        ws_detail[cellRef] = { 
            f: `SUMA(${col}2:${col}${totalRowIndex - 1})`, 
            t: 'n', 
            z: currencyFormat,
            s: { font: { bold: true }, fill: { fgColor: { rgb: "FFFFD700" } } } // Fondo amarillo
        };
    });

    // --- Añadir Filas de RESUMEN DE NÓMINA FINAL ---
    const summaryDataStartRow = totalRowIndex + 3;
    const finalTotalRow = summaryDataStartRow + 3;
    const subtotalCellRef = `B${summaryDataStartRow + 2}`;
    const guaranteedCellRef = `B${summaryDataStartRow + 1}`;
    const finalCellRef = `B${finalTotalRow}`;

    const summaryData = [
        ["CONCEPTO", "VALOR"],
        ["SUELDO BÁSICO FIJO (30 DÍAS)", SUELDO_BASE_GARANTIZADO],
        ["SUBTOTAL PAGO HORAS (Suma Columna O)", { f: `SUMA(O2:O${totalRowIndex - 1})` }],
        ["", ""],
        ["TOTAL INGRESOS ESTIMADO (Mayor entre Base y Subtotal)", { f: `MAX(${guaranteedCellRef}, ${subtotalCellRef})` }],
    ];
    
    XLSX.utils.sheet_add_aoa(ws_detail, summaryData, { origin: `A${summaryDataStartRow}` });

    // Aplicar formato de moneda y negrita a la columna B del resumen
    for(let i = summaryDataStartRow + 1; i <= finalTotalRow; i++) {
        const cellRef = 'B' + i;
        if(ws_detail[cellRef]) {
            ws_detail[cellRef].z = currencyFormat;
            if (i === finalTotalRow) {
                // Estilo para el total final
                ws_detail[cellRef].s = { 
                    font: { bold: true, sz: 14 }, 
                    fill: { fgColor: { rgb: "FFCCFFCC" } } // Fondo verde claro
                };
            }
        }
    }
    
    // --- Hoja 2: DATOS CRUDOS ---
    const ws_raw = XLSX.utils.json_to_sheet(window.shiftsExportData);


    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws_detail, "1. Reporte de Nómina");
    XLSX.utils.book_append_sheet(wb, ws_raw, "2. Datos Brutos"); 
    XLSX.writeFile(wb, "nomina_mensual_exportada.xlsx");
    
    alertUser("Datos exportados exitosamente a nomina_mensual_exportada.xlsx (Incluye fórmulas para cálculo).", "bg-green-100 border-green-400 text-green-700");
};


/** Muestra un mensaje de alerta en la UI. */
const alertUser = (message, className) => {
    const alertBox = document.getElementById('alert-box');
    alertBox.textContent = message;
    alertBox.className = `p-3 mb-4 rounded-lg border ${className} transition-opacity duration-300`;
    alertBox.style.opacity = '1';
    setTimeout(() => {
        alertBox.style.opacity = '0';
    }, 4000);
}

// =========================================================================
//                             EVENT LISTENERS
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar los datos al iniciar
    loadData();

    // 2. Establecer fecha y mes por defecto a hoy
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);
    document.getElementById('shift-date').value = today;
    document.getElementById('month-year-input').value = currentMonth;
    
    // 3. Listener para la tasa horaria (guarda y re-renderiza todo al cambiar)
    const rateInput = document.getElementById('hourly-rate');
    rateInput.addEventListener('input', () => {
        saveData('rate'); 
    });
});


// Exponer funciones necesarias globalmente (para onclick en HTML)
window.addShift = addShift;
window.deleteShift = deleteShift;
window.addHoliday = addHoliday;
window.deleteHoliday = deleteHoliday;
window.generateDefaultShifts = generateDefaultShifts;
window.exportToExcel = exportToExcel;
window.importFromExcel = importFromExcel;