// test-parser.js - Test the hardcoded parser
console.log('='.repeat(60));
console.log('🧪 TESTING HARDCODED PARSER');
console.log('='.repeat(60));
console.log('');

// Test message
const testMessage = `Train Set: KMRC-012
Depot: Muttom
Current Mileage: 288650 km
Fitness Status: Fit for Service
Job Card: JC-1045 – Brake Inspection – Pending
Branding: Election Awareness (Priority: High)
Cleaning Slot: 23:00–23:45
Reported By: Ground Staff A
Time: 25-12-2025 18:40`;

console.log('📨 Test Message:');
console.log('-'.repeat(60));
console.log(testMessage);
console.log('-'.repeat(60));
console.log('');

// Parser function (same as in server.js)
function parseTrainMessage(messageText) {
    const lines = messageText.split('\n').map(line => line.trim()).filter(line => line);
    const currentDate = new Date().toISOString().split('T')[0];
    
    const data = {
        train_id: '',
        depot: '',
        current_mileage: '',
        previous_mileage: '',
        fitness_status: 'Requires Check',
        branding_type: '',
        branding_priority: 'Medium',
        cleaning_slot: '',
        cleaning_type: 'Daily Clean',
        job_card_number: '',
        job_description: '',
        job_status: 'Pending',
        reported_by: 'Ground Staff',
        reported_time: currentDate,
        track_no: 1,
        berth: 'A1',
        orientation: 'UP'
    };
    
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        
        console.log(`  Parsing: "${key}" → "${value}"`);
        
        if (key.includes('train') && (key.includes('set') || key.includes('id'))) {
            data.train_id = value;
        } else if (key.includes('depot')) {
            data.depot = value;
        } else if (key.includes('mileage')) {
            const mileageNum = value.replace(/[^\d]/g, '');
            data.current_mileage = mileageNum;
            data.previous_mileage = Math.max(0, parseInt(mileageNum) - 500).toString();
        } else if (key.includes('fitness')) {
            data.fitness_status = value;
        } else if (key.includes('job') && key.includes('card')) {
            const parts = value.split('–').map(s => s.trim());
            data.job_card_number = parts[0] || '';
            data.job_description = parts[1] || '';
            data.job_status = parts[2] || 'Pending';
        } else if (key.includes('branding')) {
            const priorityMatch = value.match(/\(Priority:\s*(\w+)\)/i);
            data.branding_type = value.replace(/\(Priority:.*?\)/i, '').trim();
            data.branding_priority = priorityMatch ? priorityMatch[1] : 'Medium';
        } else if (key.includes('cleaning')) {
            data.cleaning_slot = value;
        } else if (key.includes('reported') && key.includes('by')) {
            data.reported_by = value;
        } else if (key.includes('time')) {
            data.reported_time = value;
        } else if (key.includes('track')) {
            data.track_no = parseInt(value) || 1;
        } else if (key.includes('berth')) {
            data.berth = value;
        }
    }
    
    if (!data.train_id) {
        const trainMatch = messageText.match(/(?:train\s*(?:set|id)?[:\s]+)?(KMRC[-_]?\d+)/i);
        if (trainMatch) {
            data.train_id = trainMatch[1];
            console.log(`  🎯 Pattern matched: ${data.train_id}`);
        }
    }
    
    return data;
}

// Converter function
function convertToJSON(parsedData) {
    const currentDate = new Date().toISOString().split('T')[0];
    
    let slotStart = `${currentDate}T23:00`;
    let slotEnd = `${currentDate}T23:45`;
    
    if (parsedData.cleaning_slot) {
        const timeMatch = parsedData.cleaning_slot.match(/(\d{2}:\d{2})[–-](\d{2}:\d{2})/);
        if (timeMatch) {
            slotStart = `${currentDate}T${timeMatch[1]}`;
            slotEnd = `${currentDate}T${timeMatch[2]}`;
        }
    }
    
    const priorityLevel = parsedData.branding_priority === 'High' ? 1 : 
                         parsedData.branding_priority === 'Low' ? 3 : 2;
    
    const currentMileage = parseInt(parsedData.current_mileage) || 0;
    const previousMileage = parseInt(parsedData.previous_mileage) || 0;
    const delta = currentMileage - previousMileage;
    
    return {
        date: currentDate,
        
        branding_priorities: parsedData.branding_type ? [{
            train_id: parsedData.train_id,
            priority_level: priorityLevel,
            branding_type: parsedData.branding_type,
            valid_from: currentDate,
            valid_to: currentDate,
            approved_by: "WhatsApp Submission",
            remarks: "Submitted via WhatsApp"
        }] : [],
        
        cleaning_slots: parsedData.cleaning_slot ? [{
            train_id: parsedData.train_id,
            cleaning_type: parsedData.cleaning_type || 'Daily Clean',
            slot_start: slotStart,
            slot_end: slotEnd,
            assigned_team: parsedData.reported_by,
            status: "Scheduled"
        }] : [],
        
        stabling_geometry: [{
            train_id: parsedData.train_id,
            yard: parsedData.depot ? `${parsedData.depot} Depot` : 'Muttom Depot',
            track_no: parsedData.track_no || 1,
            berth: parsedData.berth || 'A1',
            orientation: parsedData.orientation || "UP",
            distance_from_buffer_m: 4.5,
            remarks: "Submitted via WhatsApp"
        }],
        
        fitness_certificates: [{
            train_id: parsedData.train_id,
            rolling_stock_validity: '',
            signalling_validity: '',
            telecom_validity: '',
            status: parsedData.fitness_status
        }],
        
        job_card_status: parsedData.job_card_number ? [{
            train_id: parsedData.train_id,
            job_id: parsedData.job_card_number,
            task: parsedData.job_description,
            status: parsedData.job_status,
            assigned_team: parsedData.reported_by,
            due_date: currentDate,
            priority: parsedData.branding_priority
        }] : [],
        
        mileage: currentMileage > 0 ? [{
            train_id: parsedData.train_id,
            previous_mileage_km: previousMileage,
            current_mileage_km: currentMileage,
            delta_km: delta,
            remarks: `Reported via WhatsApp at ${parsedData.reported_time}`
        }] : []
    };
}

console.log('🔍 Parsing...');
console.log('');

const parsedData = parseTrainMessage(testMessage);

console.log('');
console.log('✅ PARSED DATA:');
console.log('-'.repeat(60));
console.log(JSON.stringify(parsedData, null, 2));

console.log('');
console.log('📦 FINAL JSON FORMAT:');
console.log('-'.repeat(60));
const finalJSON = convertToJSON(parsedData);
console.log(JSON.stringify(finalJSON, null, 2));

console.log('');
console.log('='.repeat(60));
console.log('✅ Verification:');
console.log('-'.repeat(60));
console.log(`✓ Train ID extracted: ${parsedData.train_id ? '✅' : '❌'} (${parsedData.train_id})`);
console.log(`✓ Depot extracted: ${parsedData.depot ? '✅' : '❌'} (${parsedData.depot})`);
console.log(`✓ Mileage extracted: ${parsedData.current_mileage ? '✅' : '❌'} (${parsedData.current_mileage} km)`);
console.log(`✓ Fitness status: ${parsedData.fitness_status ? '✅' : '❌'} (${parsedData.fitness_status})`);
console.log(`✓ Branding extracted: ${parsedData.branding_type ? '✅' : '❌'} (${parsedData.branding_type})`);
console.log(`✓ Priority level: ${parsedData.branding_priority ? '✅' : '❌'} (${parsedData.branding_priority})`);
console.log(`✓ Job card extracted: ${parsedData.job_card_number ? '✅' : '❌'} (${parsedData.job_card_number})`);
console.log(`✓ Cleaning slot: ${parsedData.cleaning_slot ? '✅' : '❌'} (${parsedData.cleaning_slot})`);
console.log('='.repeat(60));
console.log('');

if (parsedData.train_id) {
    console.log('🎉 SUCCESS! Parser is working correctly.');
} else {
    console.log('❌ FAILED! Train ID not extracted.');
}
console.log('');