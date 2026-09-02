(() => {
  'use strict';

  const en = {
    'app.title': 'KANTİN — Turkish Table Games',
    'language.label': 'Language',
    'header.connecting': 'Connecting…',
    'header.checking': 'Checking account status',
    'header.login': 'Sign in',
    'header.createAccount': 'Create a free account',
    'header.level': 'Level {level}',
    'header.profilePreparing': 'Preparing profile…',
    'header.friendIdHint': 'Friends can add you with this ID',
    'header.balanceVerified': 'Server-verified Kantin Coin balance',
    'header.balanceCached': 'Coin server unavailable; showing last known balance.',
    'auth.help': 'HELP',
    'auth.eyebrow': 'YOUR TABLE IS READY',
    'auth.title': 'Welcome to\nKantin.',
    'auth.subtitle': 'Backgammon, Pişti, 101 Okey and Word Clash.\nChoose your account and take a seat.',
    'auth.chooseMethod': 'CHOOSE HOW TO CONTINUE',
    'auth.googleHint': 'GOOGLE PLAY / GMAIL',
    'auth.google': 'Continue with Google',
    'auth.appleHint': 'APP STORE ACCOUNT',
    'auth.apple': 'Continue with Apple',
    'auth.facebookHint': 'FACEBOOK ACCOUNT',
    'auth.facebook': 'Continue with Facebook',
    'auth.guestHint': 'SAVED ON THIS DEVICE',
    'auth.guest': 'Play as guest',
    'auth.privacy': 'Privacy Policy',
    'auth.and': 'and',
    'auth.terms': 'Terms of Use',
    'auth.consent': 'I have read and accept.',
    'auth.secureSession': 'Secure session · Supabase Auth',
    'auth.consentRequired': 'You must accept the Privacy Policy and Terms of Use to continue.',
    'auth.preparingGuest': 'Preparing your guest account…',
    'auth.redirecting': 'Redirecting you to secure sign-in…',
    'auth.welcome': 'Welcome, {name}.',
    'auth.signOut': 'Sign out',
    'home.liveTables': 'LIVE CAMPUS TABLES',
    'home.chooseGame': 'Choose your game',
    'home.summary': '{games} GAMES · {modes} MODES',
    'home.resume': '▶ Return to match',
    'home.gamesLabel': 'Games',
    'home.modeCount': '{count} MODES',
    'home.play': 'PLAY ›',
    'nav.reward': 'Reward',
    'nav.missions': 'Missions',
    'nav.tournaments': 'Tournaments',
    'nav.inventory': 'Inventory',
    'nav.stats': 'Statistics',
    'nav.store': 'Store',
    'game.backgammon': 'Backgammon',
    'game.backgammonSubtitle': 'Roll the dice, close the board',
    'game.pisti': 'Pişti',
    'game.pistiSubtitle': 'Play a card, collect the deck',
    'game.okey': '101 Okey',
    'game.okeySubtitle': 'Open your melds, finish your hand',
    'game.word': 'Word Clash',
    'game.wordSubtitle': 'Place a letter, build your word',
    'mode.backgammon': 'Classic Backgammon',
    'mode.university': 'University Backgammon',
    'mode.pistiSolo': 'Classic Pişti',
    'mode.pistiTeam': 'Team Pişti',
    'mode.okeySolo': 'Individual 101',
    'mode.okeyTeam': 'Team 101',
    'mode.word': 'Word Clash',
    'mode.fourPlayers': '4 players',
    'mode.fourSolo': '4 players · individual',
    'desc.backgammon': 'Classic backgammon with 15 checkers',
    'desc.university': 'The same dice, two independent boards',
    'desc.pistiSolo': 'Fast and competitive',
    'desc.pistiTeam': 'Combine points with your partner',
    'desc.okeySolo': 'Open at 101 and finish your hand',
    'desc.okeyTeam': 'Teams sit opposite each other',
    'desc.word': 'Four players, each plays for their own score',
    'room.title': 'ROOM SELECTION',
    'room.gameMode': 'GAME MODE',
    'room.chooseStake': 'Choose a stake lobby',
    'room.stakeInfo': 'The stake determines your lobby and opponent pool.',
    'room.entry': 'Entry: {amount}+',
    'room.selected': 'SELECTED',
    'room.choose': 'SELECT',
    'room.practice': 'Play solo',
    'room.selectedLobby': 'SELECTED LOBBY · {amount} 🪙',
    'room.findOpponent': 'FIND OPPONENT',
    'room.insufficient': 'INSUFFICIENT KANTIN COIN',
    'room.balanceRequired': 'BALANCE REQUIRED',
    'stake.beginner': 'Beginner',
    'stake.experienced': 'Experienced',
    'stake.master': 'Master',
    'match.backLobby': '← Lobby',
    'match.searching': 'Searching for opponents…',
    'match.queuePosition': 'Queue position: {position}',
    'match.cancel': 'Cancel Search',
    'match.find': 'Find Match',
    'match.practice': 'Local Practice',
    'match.serverNote': 'Live matchmaking · Server-verified room and seat assignment',
    'utility.backMenu': '← Menu',
    'tournament.eyebrow': 'COMPETITION STAGE',
    'tournament.title': 'Tournaments',
    'tournament.copy': 'Join upcoming campus tournaments and climb the rankings.',
    'stats.eyebrow': 'PLAYER PROFILE',
    'stats.title': 'Statistics',
    'stats.copy': 'Completed online matches are saved automatically.',
    'stats.totalMatches': 'TOTAL MATCHES',
    'stats.wins': 'WINS',
    'stats.losses': 'LOSSES',
    'stats.winRate': 'WIN RATE',
    'stats.history': 'Match history',
    'stats.empty': 'No completed matches yet. Your history will appear after your first match.',
    'daily.eyebrow': 'EVERY DAY AT KANTIN',
    'daily.title': 'Daily Login Reward',
    'daily.copy': 'Keep your streak and claim the big reward on day seven.',
    'daily.day': 'DAY {day}',
    'daily.claim': 'Claim today · {amount} 🪙',
    'daily.claimed': 'Today’s reward claimed',
    'daily.adding': 'Adding reward to your account…',
    'daily.already': 'You already claimed today’s reward.',
    'daily.added': '{amount} Kantin Coin added to your account.',
    'missions.eyebrow': 'CAMPUS MISSIONS',
    'missions.title': 'Missions',
    'missions.copy': 'Play, win with friends and collect rewards.',
    'store.eyebrow': 'KANTIN STORE',
    'store.title': 'Store',
    'store.copy': 'Coin packs and special items to customize your table.',
    'inventory.eyebrow': 'COLLECTION',
    'inventory.title': 'Inventory',
    'inventory.copy': 'Equip the items you earn and purchase.',
    'rotate.title': 'Rotate your phone',
    'rotate.copy': 'KANTİN is designed for landscape mode.',
    'error.loginRequired': 'You must sign in for this action.',
    'error.coinUnavailable': 'Coin service is not ready yet.',
    'error.retry': 'Try again'
  };

  const tr = {
    ...en,
    'app.title':'KANTİN — Türk Masa Oyunları','language.label':'Dil','header.connecting':'Bağlanıyor…','header.checking':'Hesap durumu kontrol ediliyor','header.login':'Giriş yap','header.createAccount':'Ücretsiz hesap oluştur','header.level':'Seviye {level}','header.profilePreparing':'Profil hazırlanıyor…','header.friendIdHint':'Arkadaşların bu ID ile seni ekleyebilir','header.balanceVerified':'Sunucu doğrulamalı Kantin Coin bakiyesi','header.balanceCached':'Coin sunucusuna ulaşılamadı; son bilinen bakiye gösteriliyor.',
    'auth.help':'YARDIM','auth.eyebrow':'MASAN HAZIR','auth.title':'Kantine\nhoş geldin.','auth.subtitle':'Tavla, Pişti, 101 Okey ve Sözcük Kapışması.\nHesabını seç, masaya otur.','auth.chooseMethod':'DEVAM ETME YÖNTEMİNİ SEÇ','auth.googleHint':'GOOGLE PLAY / GMAIL','auth.google':'Google ile devam et','auth.appleHint':'APP STORE HESABI','auth.apple':'Apple ile devam et','auth.facebookHint':'FACEBOOK HESABI','auth.facebook':'Facebook ile devam et','auth.guestHint':'BU CİHAZDA SAKLANIR','auth.guest':'Misafir olarak oyna','auth.privacy':'Gizlilik Politikası','auth.and':'ve','auth.terms':'Kullanıcı Sözleşmesi','auth.consent':'okudum ve kabul ediyorum.','auth.secureSession':'Güvenli oturum · Supabase Auth','auth.consentRequired':'Devam etmek için Gizlilik Politikası ve Kullanıcı Sözleşmesi’ni kabul etmelisin.','auth.preparingGuest':'Misafir hesabın hazırlanıyor…','auth.redirecting':'Güvenli giriş sayfasına yönlendiriliyorsun…','auth.welcome':'Hoş geldin, {name}.','auth.signOut':'Çıkış yap',
    'home.liveTables':'CANLI KAMPÜS MASALARI','home.chooseGame':'Oyununu seç','home.summary':'{games} OYUN · {modes} MOD','home.resume':'▶ Maça dön','home.gamesLabel':'Oyunlar','home.modeCount':'{count} MOD','home.play':'OYNA ›','nav.reward':'Ödül','nav.missions':'Görevler','nav.tournaments':'Turnuvalar','nav.inventory':'Çantam','nav.stats':'İstatistik','nav.store':'Mağaza',
    'game.backgammon':'Tavla','game.backgammonSubtitle':'Zarını at, masayı kap','game.pisti':'Pişti','game.pistiSubtitle':'Kartını oyna, desteyi topla','game.okey':'101 Okey','game.okeySubtitle':'Perini aç, elini bitir','game.word':'Sözcük Kapışması','game.wordSubtitle':'Harfini koy, sözcüğünü kur','mode.backgammon':'Klasik Tavla','mode.university':'Üniversite Tavlası','mode.pistiSolo':'Klasik Pişti','mode.pistiTeam':'Eşli Pişti','mode.okeySolo':'Bireysel 101','mode.okeyTeam':'Eşli 101','mode.word':'Sözcük Kapışması','mode.fourPlayers':'4 kişi','mode.fourSolo':'4 kişi · herkes tek',
    'desc.backgammon':'Klasik 15 pullu tavla','desc.university':'Aynı zar, iki bağımsız tahta','desc.pistiSolo':'Hızlı ve rekabetçi','desc.pistiTeam':'Eşinle puanları birleştir','desc.okeySolo':'101 aç, elini bitir','desc.okeyTeam':'Karşılıklı eşlerle takım oyunu','desc.word':'Dört oyuncu, herkes kendi puanına oynar',
    'room.title':'ODA SEÇİMİ','room.gameMode':'OYUN MODU','room.chooseStake':'Bahis lobini seç','room.stakeInfo':'Bahis miktarı oynayacağın lobiyi ve rakip havuzunu belirler.','room.entry':'Giriş: {amount}+','room.selected':'SEÇİLDİ','room.choose':'SEÇ','room.practice':'Tek başına oyna','room.selectedLobby':'SEÇİLİ LOBİ · {amount} 🪙','room.findOpponent':'RAKİP BUL','room.insufficient':'YETERSİZ KANTİN COIN','room.balanceRequired':'BAKİYE GEREKLİ','stake.beginner':'Başlangıç','stake.experienced':'Tecrübeli','stake.master':'Usta',
    'match.backLobby':'← Lobi','match.searching':'Rakipler aranıyor…','match.queuePosition':'Kuyruktaki yerin: {position}','match.cancel':'Aramayı İptal Et','match.find':'Eşleşme Bul','match.practice':'Yerel Antrenman','match.serverNote':'Canlı eşleşme · Sunucu doğrulamalı oda ve koltuk ataması','utility.backMenu':'← Menü',
    'tournament.eyebrow':'REKABET SAHNESİ','tournament.title':'Turnuvalar','tournament.copy':'Yaklaşan kampüs turnuvalarına katıl ve sıralamada yüksel.','stats.eyebrow':'OYUNCU PROFİLİ','stats.title':'İstatistikler','stats.copy':'Tamamlanan çevrimiçi maçların otomatik kaydedilir.','stats.totalMatches':'TOPLAM MAÇ','stats.wins':'GALİBİYET','stats.losses':'MAĞLUBİYET','stats.winRate':'KAZANMA ORANI','stats.history':'Geçmiş oyunlar','stats.empty':'Henüz tamamlanmış maç kaydı yok. İlk maçından sonra geçmişin burada görünecek.',
    'daily.eyebrow':'HER GÜN KANTİNDE','daily.title':'Günlük Giriş Ödülü','daily.copy':'Seriyi bozma, yedinci gün büyük ödülü kap.','daily.day':'{day}. GÜN','daily.claim':'Bugünkü ödülü al · {amount} 🪙','daily.claimed':'Bugünkü ödül alındı','daily.adding':'Ödül hesabına ekleniyor…','daily.already':'Bugünkü ödülünü daha önce aldın.','daily.added':'{amount} Kantin Coin hesabına eklendi.','missions.eyebrow':'KAMPÜS GÖREVLERİ','missions.title':'Görevler','missions.copy':'Oyna, arkadaşlarınla kazan ve ödülleri topla.','store.eyebrow':'KANTİN MAĞAZASI','store.title':'Mağaza','store.copy':'Jeton paketleri ve masanı kişiselleştiren özel parçalar.','inventory.eyebrow':'KOLEKSİYON','inventory.title':'Çantam','inventory.copy':'Kazandığın ve satın aldığın eşyaları buradan kuşan.','rotate.title':'Telefonunu yatay çevir','rotate.copy':'KANTİN yatay ekran için tasarlandı.','error.loginRequired':'Bu işlem için giriş yapmalısın.','error.coinUnavailable':'Coin servisi henüz hazır değil.','error.retry':'Tekrar dene'
  };

  const ru = {
    ...en,
    'app.title':'KANTİN — Настольные игры','language.label':'Язык','header.connecting':'Подключение…','header.checking':'Проверяем аккаунт','header.login':'Войти','header.createAccount':'Создать бесплатный аккаунт','header.level':'Уровень {level}','header.profilePreparing':'Подготовка профиля…','header.friendIdHint':'Друзья могут добавить вас по этому ID','header.balanceVerified':'Баланс Kantin Coin подтверждён сервером','header.balanceCached':'Сервер монет недоступен; показан последний баланс.',
    'auth.help':'ПОМОЩЬ','auth.eyebrow':'ВАШ СТОЛ ГОТОВ','auth.title':'Добро пожаловать\nв Kantin.','auth.subtitle':'Нарды, Пишти, Окей 101 и Битва слов.\nВыберите аккаунт и садитесь за стол.','auth.chooseMethod':'ВЫБЕРИТЕ СПОСОБ ВХОДА','auth.google':'Продолжить с Google','auth.apple':'Продолжить с Apple','auth.facebook':'Продолжить с Facebook','auth.guestHint':'СОХРАНЯЕТСЯ НА УСТРОЙСТВЕ','auth.guest':'Играть как гость','auth.privacy':'Политика конфиденциальности','auth.and':'и','auth.terms':'Условия использования','auth.consent':'прочитаны и приняты.','auth.secureSession':'Безопасная сессия · Supabase Auth','auth.consentRequired':'Для продолжения примите Политику конфиденциальности и Условия использования.','auth.preparingGuest':'Создаём гостевой аккаунт…','auth.redirecting':'Переход к безопасному входу…','auth.welcome':'Добро пожаловать, {name}.','auth.signOut':'Выйти',
    'home.liveTables':'ЖИВЫЕ СТОЛЫ КАМПУСА','home.chooseGame':'Выберите игру','home.summary':'ИГР: {games} · РЕЖИМОВ: {modes}','home.resume':'▶ Вернуться в матч','home.gamesLabel':'Игры','home.modeCount':'РЕЖИМОВ: {count}','home.play':'ИГРАТЬ ›','nav.reward':'Награда','nav.missions':'Задания','nav.tournaments':'Турниры','nav.inventory':'Инвентарь','nav.stats':'Статистика','nav.store':'Магазин',
    'game.backgammon':'Нарды','game.backgammonSubtitle':'Бросайте кости и закрывайте доску','game.pisti':'Пишти','game.pistiSubtitle':'Играйте карты и забирайте колоду','game.okey':'Окей 101','game.okeySubtitle':'Выложите комбинации и завершите руку','game.word':'Битва слов','game.wordSubtitle':'Ставьте буквы и составляйте слова','mode.backgammon':'Классические нарды','mode.university':'Университетские нарды','mode.pistiSolo':'Классический Пишти','mode.pistiTeam':'Командный Пишти','mode.okeySolo':'Одиночный 101','mode.okeyTeam':'Командный 101','mode.word':'Битва слов','mode.fourPlayers':'4 игрока','mode.fourSolo':'4 игрока · каждый за себя',
    'room.title':'ВЫБОР КОМНАТЫ','room.gameMode':'РЕЖИМ ИГРЫ','room.chooseStake':'Выберите стол','room.stakeInfo':'Ставка определяет лобби и круг соперников.','room.entry':'Вход: {amount}+','room.selected':'ВЫБРАНО','room.choose':'ВЫБРАТЬ','room.practice':'Играть одному','room.selectedLobby':'ВЫБРАННЫЙ СТОЛ · {amount} 🪙','room.findOpponent':'НАЙТИ СОПЕРНИКА','room.insufficient':'НЕДОСТАТОЧНО KANTIN COIN','room.balanceRequired':'НУЖЕН БАЛАНС','stake.beginner':'Новичок','stake.experienced':'Опытный','stake.master':'Мастер',
    'match.backLobby':'← Лобби','match.searching':'Ищем соперников…','match.queuePosition':'Место в очереди: {position}','match.cancel':'Отменить поиск','match.find':'Найти матч','match.practice':'Тренировка','match.serverNote':'Живой подбор · Комната и места подтверждаются сервером','utility.backMenu':'← Меню','tournament.eyebrow':'АРЕНА СОРЕВНОВАНИЙ','tournament.title':'Турниры','tournament.copy':'Участвуйте в турнирах кампуса и поднимайтесь в рейтинге.','stats.eyebrow':'ПРОФИЛЬ ИГРОКА','stats.title':'Статистика','stats.copy':'Завершённые онлайн-матчи сохраняются автоматически.','stats.totalMatches':'ВСЕГО МАТЧЕЙ','stats.wins':'ПОБЕДЫ','stats.losses':'ПОРАЖЕНИЯ','stats.winRate':'ПРОЦЕНТ ПОБЕД','stats.history':'История матчей','stats.empty':'Завершённых матчей пока нет. История появится после первой игры.',
    'daily.eyebrow':'КАЖДЫЙ ДЕНЬ В KANTIN','daily.title':'Ежедневная награда','daily.copy':'Не прерывайте серию и заберите большую награду на седьмой день.','daily.day':'ДЕНЬ {day}','daily.claim':'Забрать сегодня · {amount} 🪙','daily.claimed':'Награда за сегодня получена','daily.adding':'Добавляем награду…','daily.already':'Сегодняшняя награда уже получена.','daily.added':'На счёт добавлено {amount} Kantin Coin.','missions.eyebrow':'ЗАДАНИЯ КАМПУСА','missions.title':'Задания','missions.copy':'Играйте, побеждайте с друзьями и получайте награды.','store.eyebrow':'МАГАЗИН KANTIN','store.title':'Магазин','store.copy':'Монеты и особые предметы для вашего стола.','inventory.eyebrow':'КОЛЛЕКЦИЯ','inventory.title':'Инвентарь','inventory.copy':'Используйте заработанные и купленные предметы.','rotate.title':'Поверните телефон','rotate.copy':'KANTİN создан для альбомного режима.','error.loginRequired':'Для этого действия нужно войти.','error.coinUnavailable':'Сервис монет ещё не готов.','error.retry':'Повторить'
  };

  const es = {
    ...en,
    'app.title':'KANTİN — Juegos de mesa','language.label':'Idioma','header.connecting':'Conectando…','header.checking':'Comprobando la cuenta','header.login':'Iniciar sesión','header.createAccount':'Crear una cuenta gratis','header.level':'Nivel {level}','header.profilePreparing':'Preparando el perfil…','header.friendIdHint':'Tus amigos pueden añadirte con este ID','header.balanceVerified':'Saldo Kantin Coin verificado por el servidor','header.balanceCached':'Servidor de monedas no disponible; se muestra el último saldo.',
    'auth.help':'AYUDA','auth.eyebrow':'TU MESA ESTÁ LISTA','auth.title':'Bienvenido a\nKantin.','auth.subtitle':'Backgammon, Pişti, Okey 101 y Duelo de Palabras.\nElige tu cuenta y toma asiento.','auth.chooseMethod':'ELIGE CÓMO CONTINUAR','auth.google':'Continuar con Google','auth.apple':'Continuar con Apple','auth.facebook':'Continuar con Facebook','auth.guestHint':'GUARDADO EN ESTE DISPOSITIVO','auth.guest':'Jugar como invitado','auth.privacy':'Política de privacidad','auth.and':'y','auth.terms':'Condiciones de uso','auth.consent':'leídas y aceptadas.','auth.secureSession':'Sesión segura · Supabase Auth','auth.consentRequired':'Debes aceptar la Política de privacidad y las Condiciones de uso.','auth.preparingGuest':'Preparando tu cuenta de invitado…','auth.redirecting':'Abriendo el inicio de sesión seguro…','auth.welcome':'Bienvenido, {name}.','auth.signOut':'Cerrar sesión',
    'home.liveTables':'MESAS EN VIVO DEL CAMPUS','home.chooseGame':'Elige tu juego','home.summary':'{games} JUEGOS · {modes} MODOS','home.resume':'▶ Volver a la partida','home.gamesLabel':'Juegos','home.modeCount':'{count} MODOS','home.play':'JUGAR ›','nav.reward':'Premio','nav.missions':'Misiones','nav.tournaments':'Torneos','nav.inventory':'Inventario','nav.stats':'Estadísticas','nav.store':'Tienda',
    'game.backgammon':'Backgammon','game.backgammonSubtitle':'Lanza los dados y cierra el tablero','game.pisti':'Pişti','game.pistiSubtitle':'Juega una carta y recoge la baraja','game.okey':'Okey 101','game.okeySubtitle':'Abre combinaciones y termina tu mano','game.word':'Duelo de Palabras','game.wordSubtitle':'Coloca letras y forma palabras','mode.backgammon':'Backgammon clásico','mode.university':'Backgammon universitario','mode.pistiSolo':'Pişti clásico','mode.pistiTeam':'Pişti por equipos','mode.okeySolo':'101 individual','mode.okeyTeam':'101 por equipos','mode.word':'Duelo de Palabras','mode.fourPlayers':'4 jugadores','mode.fourSolo':'4 jugadores · individual',
    'room.title':'SELECCIÓN DE SALA','room.gameMode':'MODO DE JUEGO','room.chooseStake':'Elige una sala de apuesta','room.stakeInfo':'La apuesta determina tu sala y tus posibles rivales.','room.entry':'Entrada: {amount}+','room.selected':'ELEGIDA','room.choose':'ELEGIR','room.practice':'Jugar en solitario','room.selectedLobby':'SALA ELEGIDA · {amount} 🪙','room.findOpponent':'BUSCAR RIVAL','room.insufficient':'KANTIN COIN INSUFICIENTES','room.balanceRequired':'SALDO NECESARIO','stake.beginner':'Inicial','stake.experienced':'Experimentado','stake.master':'Maestro',
    'match.backLobby':'← Sala','match.searching':'Buscando rivales…','match.queuePosition':'Posición en la cola: {position}','match.cancel':'Cancelar búsqueda','match.find':'Buscar partida','match.practice':'Práctica local','match.serverNote':'Emparejamiento en vivo · Sala y asiento verificados por el servidor','utility.backMenu':'← Menú','tournament.eyebrow':'ESCENARIO COMPETITIVO','tournament.title':'Torneos','tournament.copy':'Participa en torneos del campus y sube en la clasificación.','stats.eyebrow':'PERFIL DEL JUGADOR','stats.title':'Estadísticas','stats.copy':'Las partidas en línea completadas se guardan automáticamente.','stats.totalMatches':'PARTIDAS TOTALES','stats.wins':'VICTORIAS','stats.losses':'DERROTAS','stats.winRate':'PORCENTAJE DE VICTORIAS','stats.history':'Historial de partidas','stats.empty':'Aún no hay partidas completadas. El historial aparecerá tras tu primera partida.',
    'daily.eyebrow':'CADA DÍA EN KANTIN','daily.title':'Recompensa diaria','daily.copy':'Mantén tu racha y consigue el gran premio el séptimo día.','daily.day':'DÍA {day}','daily.claim':'Recoger hoy · {amount} 🪙','daily.claimed':'Recompensa de hoy recogida','daily.adding':'Añadiendo la recompensa…','daily.already':'Ya recogiste la recompensa de hoy.','daily.added':'Se añadieron {amount} Kantin Coin a tu cuenta.','missions.eyebrow':'MISIONES DEL CAMPUS','missions.title':'Misiones','missions.copy':'Juega, gana con amigos y recoge premios.','store.eyebrow':'TIENDA KANTIN','store.title':'Tienda','store.copy':'Paquetes de monedas y objetos especiales para tu mesa.','inventory.eyebrow':'COLECCIÓN','inventory.title':'Inventario','inventory.copy':'Equipa los objetos que ganes o compres.','rotate.title':'Gira el teléfono','rotate.copy':'KANTİN está diseñado para el modo horizontal.','error.loginRequired':'Debes iniciar sesión para esta acción.','error.coinUnavailable':'El servicio de monedas aún no está listo.','error.retry':'Reintentar'
  };

  const hi = {
    ...en,
    'app.title':'KANTİN — टेबल गेम्स','language.label':'भाषा','header.connecting':'कनेक्ट हो रहा है…','header.checking':'खाता जाँचा जा रहा है','header.login':'साइन इन करें','header.createAccount':'मुफ़्त खाता बनाएँ','header.level':'स्तर {level}','header.profilePreparing':'प्रोफ़ाइल तैयार हो रही है…','header.friendIdHint':'दोस्त इस ID से आपको जोड़ सकते हैं','header.balanceVerified':'सर्वर द्वारा सत्यापित Kantin Coin बैलेंस','header.balanceCached':'कॉइन सर्वर उपलब्ध नहीं; अंतिम बैलेंस दिखाया जा रहा है।',
    'auth.help':'मदद','auth.eyebrow':'आपकी मेज़ तैयार है','auth.title':'Kantin में\nआपका स्वागत है।','auth.subtitle':'बैकगैमौन, Pişti, 101 Okey और शब्द मुकाबला।\nअपना खाता चुनें और खेलना शुरू करें।','auth.chooseMethod':'जारी रखने का तरीका चुनें','auth.google':'Google से जारी रखें','auth.apple':'Apple से जारी रखें','auth.facebook':'Facebook से जारी रखें','auth.guestHint':'इस डिवाइस पर सहेजा जाएगा','auth.guest':'मेहमान के रूप में खेलें','auth.privacy':'गोपनीयता नीति','auth.and':'और','auth.terms':'उपयोग की शर्तें','auth.consent':'मैंने पढ़कर स्वीकार किया।','auth.secureSession':'सुरक्षित सत्र · Supabase Auth','auth.consentRequired':'जारी रखने के लिए गोपनीयता नीति और उपयोग की शर्तें स्वीकार करें।','auth.preparingGuest':'मेहमान खाता तैयार हो रहा है…','auth.redirecting':'सुरक्षित साइन-इन खोला जा रहा है…','auth.welcome':'स्वागत है, {name}।','auth.signOut':'साइन आउट',
    'home.liveTables':'लाइव कैंपस टेबल','home.chooseGame':'अपना खेल चुनें','home.summary':'{games} खेल · {modes} मोड','home.resume':'▶ मैच में लौटें','home.gamesLabel':'खेल','home.modeCount':'{count} मोड','home.play':'खेलें ›','nav.reward':'इनाम','nav.missions':'मिशन','nav.tournaments':'टूर्नामेंट','nav.inventory':'सामान','nav.stats':'आँकड़े','nav.store':'दुकान',
    'game.backgammon':'बैकगैमौन','game.backgammonSubtitle':'पासा फेंकें और बोर्ड बंद करें','game.pisti':'Pişti','game.pistiSubtitle':'कार्ड खेलें और डेक जमा करें','game.okey':'101 Okey','game.okeySubtitle':'मेल्ड खोलें और हाथ पूरा करें','game.word':'शब्द मुकाबला','game.wordSubtitle':'अक्षर रखें और शब्द बनाएँ','mode.backgammon':'क्लासिक बैकगैमौन','mode.university':'यूनिवर्सिटी बैकगैमौन','mode.pistiSolo':'क्लासिक Pişti','mode.pistiTeam':'टीम Pişti','mode.okeySolo':'व्यक्तिगत 101','mode.okeyTeam':'टीम 101','mode.word':'शब्द मुकाबला','mode.fourPlayers':'4 खिलाड़ी','mode.fourSolo':'4 खिलाड़ी · सभी अलग',
    'room.title':'रूम चुनें','room.gameMode':'गेम मोड','room.chooseStake':'स्टेक लॉबी चुनें','room.stakeInfo':'स्टेक आपकी लॉबी और प्रतिद्वंद्वी समूह तय करता है।','room.entry':'प्रवेश: {amount}+','room.selected':'चुना गया','room.choose':'चुनें','room.practice':'अकेले खेलें','room.selectedLobby':'चुनी लॉबी · {amount} 🪙','room.findOpponent':'प्रतिद्वंद्वी खोजें','room.insufficient':'KANTIN COIN कम हैं','room.balanceRequired':'बैलेंस चाहिए','stake.beginner':'शुरुआती','stake.experienced':'अनुभवी','stake.master':'मास्टर',
    'match.backLobby':'← लॉबी','match.searching':'प्रतिद्वंद्वी खोजे जा रहे हैं…','match.queuePosition':'कतार में स्थान: {position}','match.cancel':'खोज रद्द करें','match.find':'मैच खोजें','match.practice':'लोकल अभ्यास','match.serverNote':'लाइव मैचमेकिंग · सर्वर-सत्यापित रूम और सीट','utility.backMenu':'← मेनू','tournament.eyebrow':'प्रतियोगिता मंच','tournament.title':'टूर्नामेंट','tournament.copy':'कैंपस टूर्नामेंट में भाग लें और रैंकिंग बढ़ाएँ।','stats.eyebrow':'खिलाड़ी प्रोफ़ाइल','stats.title':'आँकड़े','stats.copy':'पूरे हुए ऑनलाइन मैच अपने आप सहेजे जाते हैं।','stats.totalMatches':'कुल मैच','stats.wins':'जीत','stats.losses':'हार','stats.winRate':'जीत प्रतिशत','stats.history':'मैच इतिहास','stats.empty':'अभी कोई मैच पूरा नहीं हुआ। पहला मैच खेलने के बाद इतिहास दिखेगा।',
    'daily.eyebrow':'KANTIN में हर दिन','daily.title':'दैनिक लॉगिन इनाम','daily.copy':'अपनी स्ट्रीक बनाए रखें और सातवें दिन बड़ा इनाम पाएँ।','daily.day':'दिन {day}','daily.claim':'आज का इनाम लें · {amount} 🪙','daily.claimed':'आज का इनाम मिल गया','daily.adding':'इनाम खाते में जोड़ा जा रहा है…','daily.already':'आज का इनाम पहले ही लिया जा चुका है।','daily.added':'आपके खाते में {amount} Kantin Coin जोड़े गए।','missions.eyebrow':'कैंपस मिशन','missions.title':'मिशन','missions.copy':'खेलें, दोस्तों के साथ जीतें और इनाम पाएँ।','store.eyebrow':'KANTIN दुकान','store.title':'दुकान','store.copy':'अपनी टेबल के लिए कॉइन पैक और खास सामान।','inventory.eyebrow':'संग्रह','inventory.title':'सामान','inventory.copy':'जीती और खरीदी वस्तुओं को लगाएँ।','rotate.title':'फ़ोन घुमाएँ','rotate.copy':'KANTİN लैंडस्केप मोड के लिए बनाया गया है।','error.loginRequired':'इस काम के लिए साइन इन करें।','error.coinUnavailable':'कॉइन सेवा अभी तैयार नहीं है।','error.retry':'फिर कोशिश करें'
  };

  const de = {
    ...en,
    'app.title':'KANTİN — Türkische Brettspiele','language.label':'Sprache','header.connecting':'Verbindung wird hergestellt…','header.checking':'Kontostatus wird geprüft','header.login':'Anmelden','header.createAccount':'Kostenloses Konto erstellen','header.level':'Level {level}','header.profilePreparing':'Profil wird vorbereitet…','header.friendIdHint':'Freunde können dich mit dieser ID hinzufügen','header.balanceVerified':'Vom Server bestätigtes Kantin-Coin-Guthaben','header.balanceCached':'Coin-Server nicht erreichbar; letzter Kontostand wird angezeigt.',
    'auth.help':'HILFE','auth.eyebrow':'DEIN TISCH IST BEREIT','auth.title':'Willkommen bei\nKantin.','auth.subtitle':'Backgammon, Pişti, Okey 101 und Wortduell.\nWähle dein Konto und nimm Platz.','auth.chooseMethod':'WÄHLE DEINE ANMELDUNG','auth.google':'Mit Google fortfahren','auth.apple':'Mit Apple fortfahren','auth.facebook':'Mit Facebook fortfahren','auth.guestHint':'AUF DIESEM GERÄT GESPEICHERT','auth.guest':'Als Gast spielen','auth.privacy':'Datenschutzerklärung','auth.and':'und','auth.terms':'Nutzungsbedingungen','auth.consent':'habe ich gelesen und akzeptiert.','auth.secureSession':'Sichere Sitzung · Supabase Auth','auth.consentRequired':'Bitte akzeptiere die Datenschutzerklärung und die Nutzungsbedingungen.','auth.preparingGuest':'Gastkonto wird vorbereitet…','auth.redirecting':'Sichere Anmeldung wird geöffnet…','auth.welcome':'Willkommen, {name}.','auth.signOut':'Abmelden',
    'home.liveTables':'LIVE-CAMPUS-TISCHE','home.chooseGame':'Wähle dein Spiel','home.summary':'{games} SPIELE · {modes} MODI','home.resume':'▶ Zurück zum Match','home.gamesLabel':'Spiele','home.modeCount':'{count} MODI','home.play':'SPIELEN ›','nav.reward':'Belohnung','nav.missions':'Aufgaben','nav.tournaments':'Turniere','nav.inventory':'Inventar','nav.stats':'Statistik','nav.store':'Shop',
    'game.backgammon':'Backgammon','game.backgammonSubtitle':'Würfle und räume das Brett','game.pisti':'Pişti','game.pistiSubtitle':'Spiele eine Karte und sammle den Stapel','game.okey':'Okey 101','game.okeySubtitle':'Lege deine Kombinationen aus und beende die Hand','game.word':'Wortduell','game.wordSubtitle':'Lege Buchstaben und bilde Wörter','mode.backgammon':'Klassisches Backgammon','mode.university':'Universitäts-Backgammon','mode.pistiSolo':'Klassisches Pişti','mode.pistiTeam':'Team-Pişti','mode.okeySolo':'101 Einzel','mode.okeyTeam':'101 Team','mode.word':'Wortduell','mode.fourPlayers':'4 Spieler','mode.fourSolo':'4 Spieler · jeder für sich',
    'room.title':'RAUMAUSWAHL','room.gameMode':'SPIELMODUS','room.chooseStake':'Einsatz-Lobby wählen','room.stakeInfo':'Der Einsatz bestimmt deine Lobby und den Gegnerpool.','room.entry':'Eintritt: {amount}+','room.selected':'AUSGEWÄHLT','room.choose':'WÄHLEN','room.practice':'Allein spielen','room.selectedLobby':'GEWÄHLTE LOBBY · {amount} 🪙','room.findOpponent':'GEGNER FINDEN','room.insufficient':'ZU WENIG KANTIN COIN','room.balanceRequired':'GUTHABEN ERFORDERLICH','stake.beginner':'Einsteiger','stake.experienced':'Erfahren','stake.master':'Meister',
    'match.backLobby':'← Lobby','match.searching':'Gegner werden gesucht…','match.queuePosition':'Warteschlangenplatz: {position}','match.cancel':'Suche abbrechen','match.find':'Match finden','match.practice':'Lokales Training','match.serverNote':'Live-Matchmaking · Serverbestätigte Raum- und Sitzzuweisung','utility.backMenu':'← Menü','tournament.eyebrow':'WETTBEWERBSBÜHNE','tournament.title':'Turniere','tournament.copy':'Nimm an Campus-Turnieren teil und steige in der Rangliste auf.','stats.eyebrow':'SPIELERPROFIL','stats.title':'Statistik','stats.copy':'Abgeschlossene Online-Matches werden automatisch gespeichert.','stats.totalMatches':'MATCHES GESAMT','stats.wins':'SIEGE','stats.losses':'NIEDERLAGEN','stats.winRate':'SIEGQUOTE','stats.history':'Matchverlauf','stats.empty':'Noch keine abgeschlossenen Matches. Nach deinem ersten Match erscheint hier der Verlauf.',
    'daily.eyebrow':'JEDEN TAG BEI KANTIN','daily.title':'Tägliche Login-Belohnung','daily.copy':'Halte deine Serie und sichere dir am siebten Tag die große Belohnung.','daily.day':'TAG {day}','daily.claim':'Heute abholen · {amount} 🪙','daily.claimed':'Heutige Belohnung abgeholt','daily.adding':'Belohnung wird gutgeschrieben…','daily.already':'Du hast die heutige Belohnung bereits abgeholt.','daily.added':'{amount} Kantin Coin wurden deinem Konto gutgeschrieben.','missions.eyebrow':'CAMPUS-AUFGABEN','missions.title':'Aufgaben','missions.copy':'Spiele, gewinne mit Freunden und sammle Belohnungen.','store.eyebrow':'KANTIN-SHOP','store.title':'Shop','store.copy':'Coin-Pakete und besondere Gegenstände für deinen Tisch.','inventory.eyebrow':'SAMMLUNG','inventory.title':'Inventar','inventory.copy':'Rüste verdiente und gekaufte Gegenstände aus.','rotate.title':'Drehe dein Handy','rotate.copy':'KANTİN ist für das Querformat ausgelegt.','error.loginRequired':'Für diese Aktion musst du dich anmelden.','error.coinUnavailable':'Der Coin-Dienst ist noch nicht bereit.','error.retry':'Erneut versuchen'
  };

  const ar = {
    ...en,
    'app.title':'KANTİN — ألعاب الطاولة','language.label':'اللغة','header.connecting':'جارٍ الاتصال…','header.checking':'جارٍ التحقق من الحساب','header.login':'تسجيل الدخول','header.createAccount':'إنشاء حساب مجاني','header.level':'المستوى {level}','header.profilePreparing':'جارٍ إعداد الملف…','header.friendIdHint':'يمكن لأصدقائك إضافتك بهذا المعرّف','header.balanceVerified':'رصيد Kantin Coin موثّق من الخادم','header.balanceCached':'خادم العملات غير متاح؛ يظهر آخر رصيد معروف.',
    'auth.help':'مساعدة','auth.eyebrow':'طاولتك جاهزة','auth.title':'مرحبًا بك في\nKantin.','auth.subtitle':'الطاولة، Pişti، أوكي 101 وتحدي الكلمات.\nاختر حسابك واجلس إلى الطاولة.','auth.chooseMethod':'اختر طريقة المتابعة','auth.google':'المتابعة باستخدام Google','auth.apple':'المتابعة باستخدام Apple','auth.facebook':'المتابعة باستخدام Facebook','auth.guestHint':'يُحفظ على هذا الجهاز','auth.guest':'اللعب كضيف','auth.privacy':'سياسة الخصوصية','auth.and':'و','auth.terms':'شروط الاستخدام','auth.consent':'قرأت ووافقت.','auth.secureSession':'جلسة آمنة · Supabase Auth','auth.consentRequired':'يجب قبول سياسة الخصوصية وشروط الاستخدام للمتابعة.','auth.preparingGuest':'جارٍ إعداد حساب الضيف…','auth.redirecting':'جارٍ فتح تسجيل الدخول الآمن…','auth.welcome':'مرحبًا، {name}.','auth.signOut':'تسجيل الخروج',
    'home.liveTables':'طاولات الحرم المباشرة','home.chooseGame':'اختر لعبتك','home.summary':'{games} ألعاب · {modes} أنماط','home.resume':'▶ العودة إلى المباراة','home.gamesLabel':'الألعاب','home.modeCount':'{count} أنماط','home.play':'العب ›','nav.reward':'المكافأة','nav.missions':'المهام','nav.tournaments':'البطولات','nav.inventory':'المقتنيات','nav.stats':'الإحصاءات','nav.store':'المتجر',
    'game.backgammon':'الطاولة','game.backgammonSubtitle':'ارمِ النرد وأغلق اللوح','game.pisti':'Pişti','game.pistiSubtitle':'العب بطاقة واجمع الرزمة','game.okey':'أوكي 101','game.okeySubtitle':'افتح مجموعاتك وأنهِ يدك','game.word':'تحدي الكلمات','game.wordSubtitle':'ضع حرفًا وكوّن كلمة','mode.backgammon':'الطاولة الكلاسيكية','mode.university':'طاولة الجامعة','mode.pistiSolo':'Pişti الكلاسيكية','mode.pistiTeam':'Pişti جماعية','mode.okeySolo':'101 فردي','mode.okeyTeam':'101 جماعي','mode.word':'تحدي الكلمات','mode.fourPlayers':'4 لاعبين','mode.fourSolo':'4 لاعبين · كل لاعب لنفسه',
    'room.title':'اختيار الغرفة','room.gameMode':'نمط اللعب','room.chooseStake':'اختر ردهة الرهان','room.stakeInfo':'يحدد الرهان الردهة ومجموعة المنافسين.','room.entry':'الدخول: +{amount}','room.selected':'محدد','room.choose':'اختر','room.practice':'العب منفردًا','room.selectedLobby':'الردهة المحددة · {amount} 🪙','room.findOpponent':'ابحث عن منافس','room.insufficient':'KANTIN COIN غير كافية','room.balanceRequired':'الرصيد مطلوب','stake.beginner':'مبتدئ','stake.experienced':'خبير','stake.master':'محترف',
    'match.backLobby':'الردهة →','match.searching':'جارٍ البحث عن منافسين…','match.queuePosition':'ترتيبك في الانتظار: {position}','match.cancel':'إلغاء البحث','match.find':'ابحث عن مباراة','match.practice':'تدريب محلي','match.serverNote':'مطابقة مباشرة · الغرفة والمقعد موثقان من الخادم','utility.backMenu':'القائمة →','tournament.eyebrow':'ساحة المنافسة','tournament.title':'البطولات','tournament.copy':'شارك في بطولات الحرم وتقدم في الترتيب.','stats.eyebrow':'ملف اللاعب','stats.title':'الإحصاءات','stats.copy':'تُحفظ المباريات المكتملة عبر الإنترنت تلقائيًا.','stats.totalMatches':'إجمالي المباريات','stats.wins':'الانتصارات','stats.losses':'الخسائر','stats.winRate':'نسبة الفوز','stats.history':'سجل المباريات','stats.empty':'لا توجد مباريات مكتملة بعد. سيظهر السجل بعد أول مباراة.',
    'daily.eyebrow':'كل يوم في KANTIN','daily.title':'مكافأة الدخول اليومية','daily.copy':'حافظ على السلسلة واحصل على المكافأة الكبرى في اليوم السابع.','daily.day':'اليوم {day}','daily.claim':'استلم مكافأة اليوم · {amount} 🪙','daily.claimed':'تم استلام مكافأة اليوم','daily.adding':'جارٍ إضافة المكافأة…','daily.already':'لقد استلمت مكافأة اليوم بالفعل.','daily.added':'تمت إضافة {amount} Kantin Coin إلى حسابك.','missions.eyebrow':'مهام الحرم','missions.title':'المهام','missions.copy':'العب واربح مع أصدقائك واجمع المكافآت.','store.eyebrow':'متجر KANTIN','store.title':'المتجر','store.copy':'حزم العملات وعناصر خاصة لتخصيص طاولتك.','inventory.eyebrow':'المجموعة','inventory.title':'المقتنيات','inventory.copy':'استخدم العناصر التي تربحها أو تشتريها.','rotate.title':'أدر هاتفك','rotate.copy':'صُممت KANTİN للوضع الأفقي.','error.loginRequired':'يجب تسجيل الدخول لهذا الإجراء.','error.coinUnavailable':'خدمة العملات غير جاهزة بعد.','error.retry':'حاول مجددًا'
  };

  const foreignPistiKeys = ['auth.subtitle', 'game.pisti', 'mode.pistiSolo', 'mode.pistiTeam'];
  for (const locale of [en, de, ru, es, hi, ar]) {
    for (const key of foreignPistiKeys) {
      locale[key] = locale[key].replace(/Pişti|Пишти/g, 'Pishti');
    }
  }

  Object.assign(en, {
    'ad.watchReward':'Watch ad · +{amount} 🪙','ad.todayRemaining':'{count} rewards left today','ad.verifying':'Verifying ad…','ad.pleaseWait':'Please wait','ad.comingSoon':'Rewarded ads coming soon','ad.networkPreparing':'Ad network is being prepared','ad.dailyLimit':'Daily limit reached','ad.tomorrow':'Available again tomorrow','ad.cooldown':'Wait for the next ad','ad.cooldownDetail':'Reward cooldown','ad.rewardAdded':'Ad reward added · +{amount} 🪙'
  });
  Object.assign(tr, {
    'ad.watchReward':'Reklam izle · +{amount} 🪙','ad.todayRemaining':'Bugün {count} hak','ad.verifying':'Reklam doğrulanıyor…','ad.pleaseWait':'Lütfen bekle','ad.comingSoon':'Ödüllü reklam yakında','ad.networkPreparing':'Reklam ağı hazırlanıyor','ad.dailyLimit':'Günlük sınır doldu','ad.tomorrow':'Yarın yeniden açılır','ad.cooldown':'Yeni reklam için bekle','ad.cooldownDetail':'Ödül bekleme süresi','ad.rewardAdded':'Reklam ödülü eklendi · +{amount} 🪙'
  });
  Object.assign(de, {
    'ad.watchReward':'Werbung ansehen · +{amount} 🪙','ad.todayRemaining':'Heute noch {count} Belohnungen','ad.verifying':'Werbung wird geprüft…','ad.pleaseWait':'Bitte warten','ad.comingSoon':'Belohnungswerbung folgt bald','ad.networkPreparing':'Werbenetzwerk wird vorbereitet','ad.dailyLimit':'Tageslimit erreicht','ad.tomorrow':'Morgen wieder verfügbar','ad.cooldown':'Auf die nächste Werbung warten','ad.cooldownDetail':'Belohnungspause','ad.rewardAdded':'Werbebelohnung gutgeschrieben · +{amount} 🪙'
  });
  Object.assign(ru, {
    'ad.watchReward':'Смотреть рекламу · +{amount} 🪙','ad.todayRemaining':'Сегодня осталось: {count}','ad.verifying':'Проверяем рекламу…','ad.pleaseWait':'Подождите','ad.comingSoon':'Реклама с наградой скоро','ad.networkPreparing':'Рекламная сеть готовится','ad.dailyLimit':'Дневной лимит исчерпан','ad.tomorrow':'Снова доступно завтра','ad.cooldown':'Подождите следующую рекламу','ad.cooldownDetail':'Пауза между наградами','ad.rewardAdded':'Награда за рекламу добавлена · +{amount} 🪙'
  });
  Object.assign(es, {
    'ad.watchReward':'Ver anuncio · +{amount} 🪙','ad.todayRemaining':'Quedan {count} recompensas hoy','ad.verifying':'Verificando anuncio…','ad.pleaseWait':'Espera un momento','ad.comingSoon':'Anuncios con premio próximamente','ad.networkPreparing':'Preparando la red publicitaria','ad.dailyLimit':'Límite diario alcanzado','ad.tomorrow':'Disponible mañana','ad.cooldown':'Espera al siguiente anuncio','ad.cooldownDetail':'Pausa de recompensa','ad.rewardAdded':'Recompensa añadida · +{amount} 🪙'
  });
  Object.assign(hi, {
    'ad.watchReward':'विज्ञापन देखें · +{amount} 🪙','ad.todayRemaining':'आज {count} इनाम बाकी','ad.verifying':'विज्ञापन सत्यापित हो रहा है…','ad.pleaseWait':'कृपया प्रतीक्षा करें','ad.comingSoon':'इनामी विज्ञापन जल्द आएँगे','ad.networkPreparing':'विज्ञापन नेटवर्क तैयार हो रहा है','ad.dailyLimit':'दैनिक सीमा पूरी हुई','ad.tomorrow':'कल फिर उपलब्ध','ad.cooldown':'अगले विज्ञापन की प्रतीक्षा करें','ad.cooldownDetail':'इनाम प्रतीक्षा समय','ad.rewardAdded':'विज्ञापन इनाम मिला · +{amount} 🪙'
  });
  Object.assign(ar, {
    'ad.watchReward':'شاهد إعلانًا · +{amount} 🪙','ad.todayRemaining':'متبقي {count} مكافآت اليوم','ad.verifying':'جارٍ التحقق من الإعلان…','ad.pleaseWait':'يرجى الانتظار','ad.comingSoon':'إعلانات المكافآت قريبًا','ad.networkPreparing':'جارٍ إعداد شبكة الإعلانات','ad.dailyLimit':'تم بلوغ الحد اليومي','ad.tomorrow':'متاح مجددًا غدًا','ad.cooldown':'انتظر الإعلان التالي','ad.cooldownDetail':'فترة انتظار المكافأة','ad.rewardAdded':'تمت إضافة مكافأة الإعلان · +{amount} 🪙'
  });

  window.KANTIN_LOCALES = Object.freeze({ en, tr, de, ru, es, hi, ar });
})();
