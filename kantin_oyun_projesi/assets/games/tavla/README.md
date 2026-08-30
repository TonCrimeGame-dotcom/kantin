# Tavla görsel sistemi

Bu klasördeki parçalar animasyon katmanlarından bağımsız tutulur:

- `board-master.png` proje için onaylanan ve bundan sonra kullanılacak ana tavla görselidir. Ahşap tonu, çerçeve, üçgen haneler, orta menteşeler, yan hazneler ve KANTİN işlemesi için görsel referans budur. Orijinal dosya en-boy oranı bozulmadan korunur; oyun ekranına uyarlanan türevler bu master üzerinden hazırlanır.
- `board-playfield-hd.png` master görselden üretilmiş aktif, yüksek çözünürlüklü oyun zeminidir (1499×1049, yaklaşık 10:7). Dört bölgede tam altışar olmak üzere 24 eşit hane, CSS pul ızgarasıyla aynı yatay ölçülerde hazırlanmıştır; pul, zar ve arayüz öğesi içermez.
- `board-surface.svg` önceki tahta görselidir ve artık aktif oyunda kullanılmaz. Aktif `.tavla-board` arka planı `board-playfield-hd.png` dosyasını açar; HTML katmanında yalnız şeffaf tıklama ve pul alanları bulunur.
- `checker-ivory.svg` ve `checker-walnut.svg` pulların taşınabilir, gerçekçi ve tamamen işaretsiz yüzleridir. Pul yüzlerinde harf, rakam, logo veya reklam kullanılmaz; kalabalık hanelerde sayı etiketi yerine gerçek pulların tamamı üst üste çizilir.
- `die-face-1.svg` … `die-face-6.svg` bir CSS 3B küpün altı ayrı yüzüdür.

Pul öğelerindeki `data-checker-key`, daha sonra uygulanacak FLIP hareket animasyonu için konum anahtarıdır. Zar küpü `data-value` üzerinden son yönünü seçer; `is-rolling` sınıfı yalnızca yeni zar geldiğinde takla animasyonunu çalıştırır.
