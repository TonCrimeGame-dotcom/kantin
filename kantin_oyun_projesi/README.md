# KANTİN

Mobil öncelikli Türk masa oyunları platformu. Yerel antrenman ve authoritative WebSocket çevrimiçi oyun destekler.

## Çalıştırma

```powershell
pnpm install
pnpm start
```

Uygulama varsayılan olarak `http://127.0.0.1:4173` adresinde açılır.

## Mimari

- `server/matchmaker.js`: Mod kuyrukları, koltuk ve takım ataması.
- `server/game-room.js`: Her maç için tek authoritative oyun motoru, kişiselleştirilmiş state, `turnId` ve `actionId` doğrulaması.
- `server/user-registry.js`: SQLite kullanıcı, arkadaşlık, maç state'i ve sohbet kalıcılığı.
- `server/server.js`: HTTP, WebSocket protokolü, reconnect, heartbeat, rate limit ve güvenlik başlıkları.
- `src/match-client.js`: Kimlik, eşleşme, oyun state'i, reconnect, arkadaşlık ve sohbet istemcisi.

İstemci kritik sonuç üretmez. Tavla zarları, Pişti destesi ve 101 taş dağılımı sunucuda oluşturulur. Pişti ve 101 state paketlerinde yalnız ilgili oyuncunun eli açıktır.

Her oyun aksiyonu şu kimlikleri taşır:

```json
{
  "type": "game:action",
  "payload": {
    "matchId": "...",
    "turnId": "matchId:version",
    "actionId": "benzersiz-istemci-kimliği",
    "action": "move",
    "payload": {}
  }
}
```

Aktif maç state'leri her kabul edilen aksiyondan sonra SQLite'a yazılır ve sunucu yeniden başladığında geri yüklenir.

## Güvenlik

- Oturum anahtarları SHA-256 özetiyle saklanır.
- WebSocket paket sınırı 16 KB'dir.
- Genel aksiyon ve sohbet için ayrı rate limit uygulanır.
- Maç sohbeti oda üyeliğiyle doğrulanır.
- CSP, frame engeli, MIME sniffing engeli ve Permissions Policy başlıkları gönderilir.
- WebSocket heartbeat ölü bağlantıları temizler.
- Tamamlanan odalar 5 dakika, terk edilmiş aktif odalar 24 saat sonra temizlenir.
- Production'da `ALLOWED_ORIGINS` mutlaka gerçek HTTPS origin'i ile ayarlanmalıdır.

## Test

```powershell
pnpm test
```

Ek çok istemcili testler çalışan sunucuya karşı yürütülebilir:

```powershell
node tests/online-game-smoke.js
node tests/all-modes-smoke.js
node tests/social-smoke.js
```
