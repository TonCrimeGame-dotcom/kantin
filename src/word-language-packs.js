(function(global){
  'use strict';

  const SUPPORTED = Object.freeze(['tr','en','de','ru','es','hi','ar']);
  const meta = {
    tr:{name:'Türkçe',intl:'tr-TR',direction:'ltr'},
    en:{name:'English',intl:'en-US',direction:'ltr'},
    de:{name:'Deutsch',intl:'de-DE',direction:'ltr'},
    ru:{name:'Русский',intl:'ru-RU',direction:'ltr'},
    es:{name:'Español',intl:'es-ES',direction:'ltr'},
    hi:{name:'हिन्दी',intl:'hi-IN',direction:'ltr'},
    ar:{name:'العربية',intl:'ar',direction:'rtl'}
  };

  const words = {
    en:['ABLE','ABOUT','ABOVE','ACT','AFTER','AGAIN','AIR','ALL','ALONE','ALSO','APPLE','AREA','AROUND','ASK','BACK','BALL','BANK','BASE','BEAR','BEAT','BEAUTY','BEGIN','BEST','BIRD','BLUE','BOARD','BOOK','BORN','BOTH','BOX','BREAD','BUILD','CALL','CALM','CARD','CARE','CARRY','CAT','CHAIR','CHANGE','CITY','CLASS','CLEAN','CLEAR','CLOCK','CLOSE','CLOUD','COIN','COLD','COLOR','COME','COOK','DANCE','DARK','DAY','DEAL','DOOR','DREAM','DRINK','EARTH','EASY','EAT','END','EVER','FACE','FAMILY','FAST','FIRE','FISH','FLOOR','FLOWER','FOOD','FRIEND','GAME','GARDEN','GIVE','GLASS','GOOD','GREEN','GROUP','GROW','HAND','HAPPY','HEART','HELP','HOME','HOUSE','IDEA','JOIN','KEEP','KIND','KING','KNOW','LAND','LARGE','LEARN','LIGHT','LINE','LOVE','MAKE','MIND','MONEY','MOON','MORNING','MOVE','NAME','NEAR','NEED','NIGHT','OPEN','PAPER','PLACE','PLANT','PLAY','POINT','POWER','RAIN','READ','RIGHT','RIVER','ROOM','ROUND','RUN','SCHOOL','SEA','SHARE','SHORT','SMALL','SMILE','SONG','STAR','START','STONE','STORY','TABLE','TAKE','TEAM','TIME','TREE','TURN','WATER','WHITE','WIN','WORD','WORLD','WRITE','YOUNG'],
    de:['ABEND','ACHT','ALLE','ALT','AMPEL','ANDERS','APFEL','ARBEIT','ARM','AUGE','AUTO','BALL','BAUM','BEIDE','BERG','BILD','BLAU','BLUME','BODEN','BROT','BRUDER','BUCH','DACH','DANKE','DEIN','DORF','DREI','DUNKEL','EINFACH','EINS','ENDE','ERDE','ESSEN','FAMILIE','FELD','FENSTER','FEUER','FISCH','FLUSS','FRAU','FREI','FREUND','FRÜH','GARTEN','GEBEN','GELD','GELB','GLAS','GLÜCK','GROSS','GRÜN','GUT','HAAR','HALLO','HAND','HAUS','HEISS','HERZ','HEUTE','HIMMEL','HUND','JAHR','JUNG','KALT','KARTE','KATZE','KIND','KLEIN','KOMMEN','KOPF','LAND','LANG','LEBEN','LEICHT','LERNEN','LESEN','LIEBE','LICHT','LUFT','MANN','MEER','MENSCH','MILCH','MORGEN','MUND','MUSIK','NACHT','NAME','NAH','NEU','OFFEN','PAPIER','PFERD','PLATZ','REGEN','RING','ROT','RUND','SCHÖN','SCHULE','SCHWARZ','SEHEN','SPIEL','STADT','STERN','STUHL','TAG','TANZ','TISCH','TÜR','UHR','VATER','VIEL','VOGEL','WALD','WASSER','WEG','WEISS','WELT','WIND','WORT','ZEIT'],
    ru:['АВТО','АДРЕС','БЕЛЫЙ','БЕРЕГ','БЛИЗКО','БРАТ','БУКВА','БУМАГА','БЫСТРО','ВЕТЕР','ВЕЧЕР','ВИД','ВОДА','ВОЗДУХ','ВОКРУГ','ВОПРОС','ВРЕМЯ','ВХОД','ГЛАЗ','ГОЛОС','ГОРА','ГОРОД','ГРУППА','ДАВАТЬ','ДАЛЕКО','ДВЕРЬ','ДЕНЬ','ДЕРЕВО','ДЕТИ','ДОБРО','ДОМ','ДРУГ','ЕДА','ЖЕНА','ЖИЗНЬ','ЗВЕЗДА','ЗЕЛЁНЫЙ','ЗЕМЛЯ','ЗИМА','ЗНАТЬ','ИГРА','ИДЕЯ','ИМЯ','КАРТА','КЛАСС','КНИГА','КОМНАТА','КОТ','КРАСНЫЙ','КРУГ','ЛЕГКО','ЛЕС','ЛЕТО','ЛИНИЯ','ЛЮБОВЬ','МАЛО','МАМА','МИР','МОРЕ','МОСТ','МУЗЫКА','МЫСЛЬ','НАЧАЛО','НЕБО','НОВЫЙ','НОЧЬ','ОГОНЬ','ОКНО','ОТЕЦ','ПАРК','ПЕСНЯ','ПИСАТЬ','ПИТЬ','ПОЛЕ','ПОЛ','ПРАВО','РАБОТА','РЕКА','РУКА','РЫБА','САД','СВЕТ','СЕМЬЯ','СИНИЙ','СЛОВО','СНЕГ','СОБАКА','СОЛНЦЕ','СТАРТ','СТЕНА','СТОЛ','СТУЛ','СЧАСТЬЕ','ТАНЕЦ','ТЕПЛО','УТРО','УЧИТЬ','ХЛЕБ','ХОРОШО','ЦВЕТОК','ЧАС','ЧЕЛОВЕК','ЧЁРНЫЙ','ШКОЛА','ЯБЛОКО'],
    es:['AGUA','AIRE','ALTO','AMIGO','AMOR','AÑO','ÁRBOL','ARTE','AZUL','BAILE','BANCO','BARCO','BIEN','BLANCO','BOCA','BOLA','BONITO','BRAZO','BUENO','CALLE','CALOR','CAMBIO','CAMINO','CAMPO','CARA','CARTA','CASA','CERCA','CIUDAD','CLASE','CLARO','COCHE','COLOR','COMER','CORAZÓN','CORTO','DAR','DÍA','DINERO','DULCE','EMPEZAR','ESCUELA','FAMILIA','FELIZ','FIESTA','FLOR','FONDO','FUEGO','FUERTE','GATO','GENTE','GRANDE','GRUPO','HABLAR','HERMANO','HIJO','HORA','IDEA','JARDÍN','JOVEN','JUEGO','JUGAR','LARGO','LEER','LIBRO','LIMPIO','LÍNEA','LUZ','MADRE','MANO','MAR','MESA','MIRAR','MUNDO','MÚSICA','NEGRO','NIÑO','NOCHE','NOMBRE','NUEVO','OJO','PADRE','PAN','PAPEL','PARQUE','PEQUEÑO','PERRO','PIEDRA','PLANTA','PLAYA','PUERTA','PUNTO','RÁPIDO','RÍO','ROJO','RONDA','SABER','SILLA','SOL','TIEMPO','TIERRA','TOMAR','TRABAJO','VER','VERDE','VIDA','VIENTO','VIVIR','VOZ'],
    hi:['आज','आग','आगे','आकाश','आदमी','आम','आना','आनंद','आवाज़','आशा','आसान','इधर','एक','और','कई','कम','कमरा','काम','काला','किताब','किनारा','खाना','खेल','खुश','गाँव','गाना','गेंद','घर','चाय','चार','चेहरा','छोटा','जल','जाना','जीवन','जमीन','दिन','दिल','दो','दोस्त','दूध','दूर','देखना','देश','नदी','नया','नाम','नीला','पानी','पिता','पेड़','पैसा','प्यार','फूल','बच्चा','बड़ा','बहन','बात','बाहर','बारिश','भाई','भारत','भोजन','माँ','मिट्टी','मित्र','मीठा','मुँह','रंग','रात','रास्ता','लाल','लिखना','लोग','वन','वापस','विचार','शहर','शाम','सफेद','समय','सवाल','साथ','साफ','सूरज','स्कूल','हवा','हाथ','हरा'],
    ar:['أب','أخ','أرض','أزرق','أسرة','أكل','أم','أمل','باب','بارد','بحر','بداية','بيت','تحت','تراب','جميل','جديد','جبل','حديقة','حار','حب','حجر','خبز','خير','درب','دراسة','رأس','رجل','ريح','سماء','سريع','سعيد','سلام','سهل','سوق','شجرة','شمس','صباح','صديق','صغير','صوت','طاولة','طريق','طعام','طفل','عائلة','عالم','عين','عمل','عيد','غرفة','فكرة','قريب','قلب','قلم','قمر','كتاب','كبير','كرة','كلمة','لعبة','ليل','ماء','مدينة','مدرسة','مال','مساء','مفتاح','مكان','منزل','موسيقى','نار','ناس','نجم','نهر','نهار','نور','هواء','وقت','وردة','ولد','يوم']
  };

  const fixedLetters = {
    tr:{A:[12,1],B:[2,3],C:[2,4],'Ç':[2,4],D:[2,3],E:[8,1],F:[1,7],G:[1,5],'Ğ':[1,8],H:[1,5],I:[4,2],'İ':[7,1],J:[1,10],K:[7,1],L:[7,1],M:[4,2],N:[5,1],O:[3,2],'Ö':[1,7],P:[1,5],R:[6,1],S:[3,2],'Ş':[2,4],T:[5,1],U:[3,2],'Ü':[2,3],V:[1,7],Y:[2,3],Z:[2,4]},
    en:{A:[9,1],B:[2,3],C:[2,3],D:[4,2],E:[12,1],F:[2,4],G:[3,2],H:[2,4],I:[9,1],J:[1,8],K:[1,5],L:[4,1],M:[2,3],N:[6,1],O:[8,1],P:[2,3],Q:[1,10],R:[6,1],S:[4,1],T:[6,1],U:[4,1],V:[2,4],W:[2,4],X:[1,8],Y:[2,4],Z:[1,10]},
    de:{A:[5,1],B:[2,3],C:[2,4],D:[4,1],E:[15,1],F:[2,4],G:[3,2],H:[4,2],I:[6,1],J:[1,6],K:[2,4],L:[3,2],M:[4,3],N:[9,1],O:[3,2],P:[1,4],Q:[1,10],R:[6,1],S:[7,1],T:[6,1],U:[6,1],V:[1,6],W:[1,3],X:[1,8],Y:[1,10],Z:[1,3],'Ä':[1,6],'Ö':[1,8],'Ü':[1,6]},
    es:{A:[12,1],B:[2,3],C:[4,3],D:[5,2],E:[12,1],F:[1,4],G:[2,2],H:[2,4],I:[6,1],J:[1,8],L:[4,1],M:[2,3],N:[5,1],'Ñ':[1,8],O:[9,1],P:[2,3],Q:[1,5],R:[5,1],S:[6,1],T:[4,1],U:[5,1],V:[1,4],X:[1,8],Y:[1,4],Z:[1,10]},
    ru:{А:[8,1],Б:[2,3],В:[4,1],Г:[2,3],Д:[4,2],Е:[8,1],Ж:[1,5],З:[2,5],И:[5,1],Й:[1,4],К:[4,2],Л:[4,2],М:[3,2],Н:[5,1],О:[10,1],П:[4,2],Р:[5,1],С:[5,1],Т:[5,1],У:[4,2],Ф:[1,8],Х:[1,5],Ц:[1,5],Ч:[1,5],Ш:[1,8],Щ:[1,10],Ъ:[1,10],Ы:[2,4],Ь:[2,3],Э:[1,8],Ю:[1,8],Я:[2,3]}
  };

  function normalizeLocale(value){const code=String(value||'').trim().replace('_','-').toLowerCase().split('-')[0];return SUPPORTED.includes(code)?code:'tr'}
  function normalizeWord(locale,value){
    const code=normalizeLocale(locale);let text=String(value||'').normalize('NFC').trim();
    if(code==='ar')text=text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي');
    if(code==='es')text=text.toLocaleUpperCase('es-ES').replace(/Ñ/g,'\uFFFF').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\uFFFF/g,'Ñ').normalize('NFC');
    else if(code==='ru')text=text.toLocaleUpperCase('ru-RU').replace(/Ё/g,'Е');
    else if(code!=='ar'&&code!=='hi')text=text.toLocaleUpperCase(meta[code].intl);
    return text.replace(/[\s\-']/g,'');
  }
  function tokens(locale,value){
    const code=normalizeLocale(locale),text=normalizeWord(code,value);if(!text)return[];
    if(code==='hi'&&typeof Intl!=='undefined'&&Intl.Segmenter)return[...new Intl.Segmenter('hi',{granularity:'grapheme'}).segment(text)].map(item=>item.segment);
    return Array.from(text);
  }
  function derivedLetters(locale,list){
    const frequency=new Map();for(const word of list)for(const token of tokens(locale,word))frequency.set(token,(frequency.get(token)||0)+1);
    const total=[...frequency.values()].reduce((sum,count)=>sum+count,0)||1,out={};
    for(const [token,count] of frequency){const ratio=count/total,amount=Math.max(1,Math.round(ratio*98)),value=ratio>.08?1:ratio>.04?2:ratio>.02?3:ratio>.01?5:8;out[token]=[amount,value]}
    return out;
  }
  function dictionary(locale,extra=[]){
    const code=normalizeLocale(locale),source=code==='tr'&&Array.isArray(global.KANTIN_TURKISH_WORDS)?global.KANTIN_TURKISH_WORDS:words[code]||[];
    return new Set([...source,...extra].map(word=>normalizeWord(code,word)).filter(Boolean));
  }
  function get(locale){const code=normalizeLocale(locale);return Object.freeze({...meta[code],locale:code,letters:fixedLetters[code]||derivedLetters(code,words[code]||[]),starterWords:[...(words[code]||[])]})}
  const api=Object.freeze({SUPPORTED,normalizeLocale,normalizeWord,tokens,dictionary,get});
  global.KANTIN_WORD_LANGUAGES=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
