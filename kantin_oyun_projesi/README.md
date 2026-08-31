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

## Bulut bağlantıları

- GitHub `main` dalı Vercel'deki `kantingame` projesini otomatik dağıtır.
- Vercel proje kökü `kantin_oyun_projesi` klasörüdür.
- Supabase şeması `supabase/migrations` altında sürümlenir.
- `GET /api/health`, Vercel sunucu fonksiyonundan Supabase'e yetkili bir sağlık sorgusu gönderir.

Gerekli ortam değişkenleri `.env.example` içinde yalnızca adlarıyla listelenir. `SUPABASE_SECRET_KEY` tarayıcı koduna eklenmemeli ve Git'e kaydedilmemelidir.

Mevcut authoritative WebSocket oyun sunucusu hâlâ SQLite ve process belleğini kullanır. Gerçek eşleşme aşamasında kuyruk ve oda state'i Supabase tabanlı kalıcı yapıya taşınmadan bu sunucu yatay ölçeklenmemelidir.

## Güvenlik

- Oturum anahtarları SHA-256 özetiyle saklanır.
- WebSocket paket sınırı 16 KB'dir.
- Genel aksiyon ve sohbet için ayrı rate limit uygulanır.
- Maç sohbeti oda üyeliğiyle doğrulanır.
- CSP, frame engeli, MIME sniffing engeli ve Permissions Policy başlıkları gönderilir.
- WebSocket heartbeat ölü bağlantıları temizler.
- Tamamlanan odalar 5 dakika, terk edilmiş aktif odalar 24 saat sonra temizlenir.
- Production'da `ALLOWED_ORIGINS` mutlaka gerçek HTTPS origin'i ile ayarlanmalıdır.

## Kantin Coin ekonomisi

- `coin_wallets`, oyuncunun sunucu tarafından doğrulanan güncel bakiyesini tutar.
- `coin_transactions`, her kazanma ve harcama hareketini değiştirilemez bir defter olarak saklar.
- Her ekonomi hareketi bir `idempotency_key` taşır; aynı sunucu isteği tekrar gönderilirse bakiye ikinci kez değişmez.
- Tarayıcı cüzdana doğrudan yazamaz. Maç ödülü, giriş bedeli ve ilerideki mağaza makbuzları yalnızca service-role kullanan authoritative sunucudan işlenir.
- `economy_settings`, `economy_stakes` ve `economy_daily_rewards` değerleri Supabase üzerinden değiştirilir; bu değişiklikler için uygulama sürümü çıkarılmaz.
- Günlük ödül, İstanbul takvim gününe göre yalnızca bir kez verilir ve arayüz gerçek cüzdan bakiyesini gösterir.
- `profiles.coins` eski istemciler için salt okunur bir uyumluluk aynasıdır; asıl kaynak `coin_wallets.balance` alanıdır.

Gerçek para ürünleri henüz aktif değildir. Google Play Billing, Apple In-App Purchase, Telegram Stars ve Meta ödeme makbuzları yayın aşamasında ayrı adaptörlerle doğrulanıp aynı işlem defterine yazılacaktır.

## Dil altyapısı

- İlk istemci paketi Türkçe, İngilizce, Almanca, Rusça, İspanyolca, Hintçe ve Arapça destekler.
- İlk açılışta URL `lang` parametresi, cihazda saklanan tercih, Telegram `language_code` değeri ve tarayıcı dili sırasıyla değerlendirilir; eşleşme yoksa İngilizce kullanılır.
- Oyuncunun seçtiği dil `profiles.preferred_locale` alanında saklanır ve native uygulama, Telegram Mini App ile Facebook istemcileri arasında paylaşılır.
- Arapça arayüz RTL çalışır; tavla, Pişti, 101 Okey ve Sözcük oyun alanlarının fiziksel yönü değişmez.
- Sezon ve etkinlik metinleri `localized_content` tablosundan yönetilebilir. Böylece Ramazan, Paskalya ve benzeri canlı içerik metinleri yeni uygulama sürümü beklemeden değiştirilebilir.
- Sözcük Kapışması sözlüğü arayüz dilinden ayrı bir oyun içeriğidir. Şu anki motor Türkçe sözlük kullanır; diğer diller için doğrulanmış sözlük/harf-değeri paketleri ve dil bazlı eşleşme havuzları ayrıca eklenmelidir.

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
