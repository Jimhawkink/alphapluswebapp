const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://enlqpifpxuecxxozyiak.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    let output = '';

    // Check users table
    const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('*');

    if (usersErr) {
        output += 'USERS TABLE ERROR: ' + JSON.stringify(usersErr) + '\n';
    } else {
        output += 'USERS TABLE: ' + JSON.stringify(users, null, 2) + '\n';
    }

    // Check registration table
    const { data: regs, error: regsErr } = await supabase
        .from('registration')
        .select('*');

    if (regsErr) {
        output += 'REGISTRATION TABLE ERROR: ' + JSON.stringify(regsErr) + '\n';
    } else {
        output += 'REGISTRATION TABLE: ' + JSON.stringify(regs, null, 2) + '\n';
    }

    fs.writeFileSync('user_results.txt', output);
    console.log('Results written to user_results.txt');
}

main().catch(err => {
    fs.writeFileSync('user_results.txt', 'FATAL ERROR: ' + err.message);
    console.log('Error - check user_results.txt');
});
