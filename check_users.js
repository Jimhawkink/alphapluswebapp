// Quick script to list all users from the Supabase 'users' table
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://enlqpifpxuecxxozyiak.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    console.log('=== Checking "users" table ===');
    const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('user_id, user_name, name, user_type, password_hash, pin, active, email');

    if (usersErr) {
        console.log('users table error:', usersErr.message);
    } else if (users && users.length > 0) {
        console.log(`Found ${users.length} user(s):`);
        users.forEach(u => {
            console.log(`  Username: "${u.user_name}" | Name: "${u.name}" | Type: ${u.user_type} | Password: "${u.password_hash}" | PIN: "${u.pin}" | Active: ${u.active}`);
        });
    } else {
        console.log('No users found in "users" table.');
    }

    console.log('\n=== Checking "registration" table ===');
    const { data: regs, error: regsErr } = await supabase
        .from('registration')
        .select('user_id, user_type, password, name, contact_no, email_id, active');

    if (regsErr) {
        console.log('registration table error:', regsErr.message);
    } else if (regs && regs.length > 0) {
        console.log(`Found ${regs.length} user(s):`);
        regs.forEach(u => {
            console.log(`  UserID: "${u.user_id}" | Name: "${u.name}" | Type: ${u.user_type} | Password: "${u.password}" | Active: ${u.active}`);
        });
    } else {
        console.log('No users found in "registration" table.');
    }
}

main().catch(err => console.error('Error:', err));
