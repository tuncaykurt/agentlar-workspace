const URL = 'https://gayrimenkul-supabase.yapayzekaotomasyon.cloud/rest/v1/settings?key=eq.office_sync_max_items';
const KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NTgzNTY2MCwiZXhwIjo0OTMxNTA5MjYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.PAOT09M4b_1PdBs6SP68FKSyzpStWhecc6XxKTrA21o';

async function update() {
    try {
        const res = await fetch(URL, {
            method: 'PATCH',
            headers: {
                'apikey': KEY,
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: 1000 })
        });
        
        if (res.ok) {
            console.log('Sync limiti basariyla 1000 yapildi!');
        } else {
            console.error('Hata:', await res.text());
        }
    } catch (err) {
        console.error('Hata:', err);
    }
}

update();
