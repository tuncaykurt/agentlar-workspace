const URL = 'https://gayrimenkul-supabase.yapayzekaotomasyon.cloud/rest/v1/market_listings?source=eq.sahibinden';
const KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NTgzNTY2MCwiZXhwIjo0OTMxNTA5MjYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.PAOT09M4b_1PdBs6SP68FKSyzpStWhecc6XxKTrA21o';

async function fix() {
    try {
        const res = await fetch(URL, {
            method: 'PATCH',
            headers: {
                'apikey': KEY,
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_active: true })
        });
        
        if (res.ok) {
            console.log('Tum ilanlar basariyla aktif edildi!');
        } else {
            const text = await res.text();
            console.error('Hata:', text);
        }
    } catch (err) {
        console.error('Fetch hatasi:', err.message);
    }
}

fix();
