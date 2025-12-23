// Constantes Legales Ecuador
const SUELDO_BASE_GARANTIZADO = 483.00;
const DESCUENTO_QUINCENA = 193.20;
const TASA_IESS = 0.0945;

// Variables de Estado
let shifts = [];
let holidays = [];

// ==========================================
// 1. GESTIÓN DE DATOS (LocalStorage)
// ==========================================

function loadData() {
    const savedShifts = localStorage.getItem('nomina_shifts');
    const savedHolidays = localStorage.getItem('nomina_holidays');
    const savedRate = localStorage.getItem('nomina_rate');

    if (savedShifts) {
        shifts = JSON.parse(savedShifts).map(s => ({
            ...s,
            date: new Date(s.date)
        }));
    }

    if (savedHolidays) {
        holidays = JSON.parse(savedHolidays);
    }

    if (savedRate) {
        document.getElementById('hourly-rate').value = savedRate;
    }

    renderHolidays();
    renderShifts();
}

function saveData() {
    localStorage.setItem('nomina_shifts', JSON.stringify(shifts));
    localStorage.setItem('nomina_holidays', JSON.stringify(holidays));
    localStorage.setItem('nomina_rate', document.getElementById('hourly-rate').value);
    renderShifts();
}

function clearAllData() {
    if(confirm("¿Estás seguro de borrar todos los datos?")) {
        localStorage.clear();
        shifts = [];
        holidays = [];
        location.reload();
    }
}

// ==========================================
// 2. CÁLCULOS
// ==========================================

function calculateNightHours(startTimeStr, endTimeStr) {
    const NIGHT_START = 22; 
    const NIGHT_END = 6;    
    let start = new Date();
    let end = new Date();
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    
    start.setHours(startH, startM, 0, 0);
    end.setHours(endH, endM, 0, 0);
    
    if (end.getTime() <= start.getTime()) { end.setDate(end.getDate() + 1); }
    
    let nightHours = 0;
    let currentTime = new Date(start.getTime());
    
    while (currentTime.getTime() < end.getTime()) {
        let currentHour = currentTime.getHours();
        let nextTime = new Date(currentTime.getTime() + 60000); 
        if (nextTime.getTime() > end.getTime()) nextTime = end;
        
        const isNight = (currentHour >= NIGHT_START && currentHour <= 23) || (currentHour >= 0 && currentHour < NIGHT_END);
        if (isNight) nightHours += (nextTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
        
        currentTime = nextTime;
    }
    return nightHours;
}

function calculateShift(shift) {
    const rate = parseFloat(document.getElementById('hourly-rate').value) || 2.0125;
    const dateStr = shift.date.toISOString().split('T')[0];
    const isHoliday = holidays.some(h => h.date === dateStr);

    let start = new Date();
    let end = new Date();
    const [startH, startM] = shift.startTime.split(':').map(Number);
    const [endH, endM] = shift.endTime.split(':').map(Number);
    
    start.setHours(startH, startM, 0, 0);
    end.setHours(endH, endM, 0, 0);
    if (end.getTime() <= start.getTime()) { end.setDate(end.getDate() + 1); }
    
    const totalHoursRaw = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const totalHours = Math.max(0, totalHoursRaw - 0.5);

    const normalHours = Math.min(totalHours, 8);
    const extra50Hours = totalHours > 8 ? Math.min(totalHours - 8, 2) : 0;
    const extra100Hours = totalHours > 10 ? totalHours - 10 : 0;
    const nightHours = calculateNightHours(shift.startTime, shift.endTime);

    const basePay = totalHours * rate;
    const extra50Surcharge = extra50Hours * rate * 0.5;
    const extra100Surcharge = extra100Hours * rate * 1.0;
    const nightSurcharge = nightHours * rate * 0.25;
    const holidaySurcharge = isHoliday ? totalHours * rate : 0;

    const totalDailyPay = basePay + extra50Surcharge + extra100Surcharge + nightSurcharge + holidaySurcharge;

    return {
        totalHours, normalHours, extra50: extra50Hours, extra100: extra100Hours, nightHours,
        totalDailyPay, isHoliday
    };
}

// ==========================================
// 3. RENDERIZADO
// ==========================================

function renderShifts() {
    shifts.sort((a, b) => a.date - b.date);

    const tableBody = document.getElementById('shifts-body');
    tableBody.innerHTML = '';
    let totalDailyPaySum = 0;

    if (shifts.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-gray-400">Sin turnos registrados.</td></tr>`;
    }

    shifts.forEach(shift => {
        const calc = calculateShift(shift);
        totalDailyPaySum += calc.totalDailyPay;
        const dateDisplay = shift.date.toLocaleDateString('es-ES');

        const row = document.createElement('tr');
        row.className = `border-b hover:bg-gray-50 ${calc.isHoliday ? 'bg-red-50' : ''}`;
        row.innerHTML = `
            <td class="px-2 py-2 text-sm font-medium">${dateDisplay} ${calc.isHoliday ? '🚩' : ''}</td>
            <td class="px-2 py-2 text-sm text-gray-500">${shift.startTime}</td>
            <td class="px-2 py-2 text-sm text-gray-500">${shift.endTime}</td>
            <td class="px-2 py-2 text-sm font-semibold text-blue-600">${calc.totalHours.toFixed(2)}</td>
            <td class="px-2 py-2 text-sm text-gray-700">${calc.normalHours.toFixed(2)}</td>
            <td class="px-2 py-2 text-sm text-orange-600">${calc.extra50.toFixed(2)}</td>
            <td class="px-2 py-2 text-sm text-red-600">${calc.extra100.toFixed(2)}</td>
            <td class="px-2 py-2 text-sm text-purple-600">${calc.nightHours.toFixed(2)}</td>
            <td class="px-2 py-2 text-sm font-bold text-green-700">$${calc.totalDailyPay.toFixed(2)}</td>
            <td class="px-2 py-2 text-right space-x-1">
                <button onclick="openEditModal('${shift.id}')" class="btn-edit">Editar</button>
                <button onclick="deleteShift('${shift.id}')" class="btn-danger">Eliminar</button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    renderTotals(totalDailyPaySum);
}

function renderTotals(totalSum) {
    const totalIngresos = Math.max(SUELDO_BASE_GARANTIZADO, totalSum);
    const descuentoIESS = totalIngresos * TASA_IESS;
    const liquidoARecibir = totalIngresos - descuentoIESS - DESCUENTO_QUINCENA;

    document.getElementById('totals-row').innerHTML = `<td colspan="8" class="px-2 py-2 text-right font-bold text-gray-500">TOTAL BRUTO TURNOS:</td><td class="px-2 py-2 font-bold text-gray-700">$${totalSum.toFixed(2)}</td><td></td>`;
    document.getElementById('guaranteed-salary-row').innerHTML = `<td colspan="8" class="px-2 py-2 text-right font-bold text-gray-500 text-xs italic">SUELDO BÁSICO FIJO (REF):</td><td class="px-2 py-2 font-bold text-gray-400 text-xs italic">$${SUELDO_BASE_GARANTIZADO.toFixed(2)}</td><td></td>`;
    document.getElementById('final-total-row').innerHTML = `<td colspan="8" class="px-2 py-3 text-right text-lg font-bold text-gray-800">TOTAL INGRESOS (GRAVABLE):</td><td class="px-2 py-3 text-lg font-bold text-indigo-700">$${totalIngresos.toFixed(2)}</td><td></td>`;
    document.getElementById('iess-row').innerHTML = `<td colspan="8" class="px-2 py-2 text-right font-bold text-red-500">(-) DESCUENTO IESS (9.45%):</td><td class="px-2 py-2 font-bold text-red-600">-$${descuentoIESS.toFixed(2)}</td><td></td>`;
    document.getElementById('quincena-row').innerHTML = `<td colspan="8" class="px-2 py-2 text-right font-bold text-red-500">(-) DESCUENTO QUINCENA (15NA):</td><td class="px-2 py-2 font-bold text-red-600">-$${DESCUENTO_QUINCENA.toFixed(2)}</td><td></td>`;
    document.getElementById('neto-row').innerHTML = `<td colspan="8" class="px-2 py-4 text-right text-xl font-black text-gray-900 uppercase">LÍQUIDO A RECIBIR:</td><td class="px-2 py-4 text-xl font-black text-green-700">$${liquidoARecibir.toFixed(2)}</td><td></td>`;
}

function renderHolidays() {
    const list = document.getElementById('holidays-list');
    list.innerHTML = '';
    holidays.forEach(h => {
        const item = document.createElement('li');
        item.className = "flex justify-between items-center text-xs bg-white p-2 rounded-lg border mb-1 shadow-sm";
        item.innerHTML = `<span class="font-medium text-red-600">${h.date}</span><button onclick="deleteHoliday('${h.id}')" class="text-gray-400 hover:text-red-500 font-bold">✕</button>`;
        list.appendChild(item);
    });
}

// ==========================================
// 4. FUNCIONES DE INTERACCIÓN
// ==========================================

function addShift(event) {
    event.preventDefault();
    const form = event.target;
    const newShift = {
        id: Date.now().toString(),
        date: new Date(form['shift-date'].value + 'T00:00:00'),
        startTime: form['start-time'].value,
        endTime: form['end-time'].value
    };
    shifts.push(newShift);
    saveData();
    form.reset();
}

function deleteShift(id) {
    shifts = shifts.filter(s => s.id !== id);
    saveData();
}

function openEditModal(id) {
    const shift = shifts.find(s => s.id === id);
    if (!shift) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-date').value = shift.date.toISOString().split('T')[0];
    document.getElementById('edit-start').value = shift.startTime;
    document.getElementById('edit-end').value = shift.endTime;
    document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
}

function saveEdit(event) {
    event.preventDefault();
    const id = document.getElementById('edit-id').value;
    const index = shifts.findIndex(s => s.id === id);
    if (index !== -1) {
        shifts[index].date = new Date(document.getElementById('edit-date').value + 'T00:00:00');
        shifts[index].startTime = document.getElementById('edit-start').value;
        shifts[index].endTime = document.getElementById('edit-end').value;
        saveData();
        closeEditModal();
    }
}

function addHoliday(event) {
    event.preventDefault();
    const date = document.getElementById('holiday-date-input').value;
    if (!date) return;
    holidays.push({ id: Date.now().toString(), date: date });
    saveData();
    document.getElementById('holiday-date-input').value = '';
}

function deleteHoliday(id) {
    holidays = holidays.filter(h => h.id !== id);
    saveData();
    renderHolidays();
}

function generateDefaultShifts() {
    const monthYear = document.getElementById('month-year-input').value;
    if (!monthYear) return;
    
    if(confirm("Esto borrará los turnos actuales y generará nuevos para el mes seleccionado. ¿Continuar?")) {
        const [year, month] = monthYear.split('-').map(Number);
        shifts = [];
        for (let i = 1; i <= 30; i++) {
            const date = new Date(year, month - 1, i);
            if (date.getMonth() !== month - 1) break;
            shifts.push({ id: Date.now().toString() + i, date: date, startTime: '08:30', endTime: '17:00' });
        }
        saveData();
    }
}

// ==========================================
// 5. EXCEL AVANZADO (IMPORT/EXPORT)
// ==========================================

function exportToExcel() {
    const rate = parseFloat(document.getElementById('hourly-rate').value);
    const filename = `Nomina_${new Date().toISOString().split('T')[0]}.xlsx`;
    const rows = [["Fecha", "Inicio", "Fin", "Total Horas", "Pago Diario", "Es Feriado"]];
    
    shifts.forEach(shift => {
        const calc = calculateShift(shift);
        rows.push([
            shift.date.toLocaleDateString('es-ES'),
            shift.startTime,
            shift.endTime,
            calc.totalHours,
            calc.totalDailyPay,
            calc.isHoliday ? "SÍ" : "NO"
        ]);
    });

    let totalBruto = shifts.reduce((sum, s) => sum + calculateShift(s).totalDailyPay, 0);
    rows.push(["", "", "", "TOTAL BRUTO:", totalBruto]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nomina");
    XLSX.writeFile(wb, filename);
}

// PARSER ROBUSTO (Arregla el error de los 12 elementos)
function parseExcelDate(val) {
    // 1. Números de Excel (La forma más segura)
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        return new Date(d.y, d.m - 1, d.d);
    }

    // 2. Textos
    if (typeof val === 'string') {
        val = val.trim();
        // Intentar formato DD/MM/YYYY (Común en Ecuador)
        const parts = val.split(/[\/\-]/);
        if (parts.length === 3) {
            // Asumimos DD-MM-YYYY
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1; // Meses son 0-11
            const y = parseInt(parts[2], 10);
            
            // Validación básica
            if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
                return new Date(y, m, d);
            }
        }
        // Intentar lectura nativa como respaldo
        const date = new Date(val);
        if (!isNaN(date.getTime())) return date;
    }
    return null; 
}

function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        
        // ¡IMPORTANTE! cellDates: false obliga a leer datos crudos para no confundir meses
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        let importedCount = 0;
        
        // 1. LIMPIAR DATOS ANTERIORES (Para que no se monten encima)
        shifts = []; 

        // Leer filas (saltando la cabecera si existe)
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            if (!row || row.length < 3) continue;

            // Saltar cabecera
            if (typeof row[0] === 'string' && row[0].toLowerCase().includes('fecha')) continue;

            // 2. USAR EL PARSER ROBUSTO
            const finalDate = parseExcelDate(row[0]);
            
            if (!finalDate || isNaN(finalDate.getTime())) continue;

            shifts.push({
                id: Date.now().toString() + Math.random(),
                date: finalDate,
                startTime: formatExcelTime(row[1]),
                endTime: formatExcelTime(row[2])
            });
            importedCount++;
        }
        
        saveData();
        alert(`Se importaron ${importedCount} turnos correctamente. (Lista anterior borrada)`);
        event.target.value = ''; 
    };
    reader.readAsArrayBuffer(file);
}

function formatExcelTime(val) {
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') {
        // Excel guarda horas como fracción del día (ej: 0.5 es mediodía)
        const totalSeconds = Math.round(val * 24 * 3600);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return "08:30";
}

window.onload = loadData;
