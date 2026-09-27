// Fertige Wörter und Sätze für die typischen Laut-Verwechslungen.
// Jeder Eintrag: [richtig, Emoji, so klingt es falsch]
// Beim Ä nur langes Ä („Käse“), denn kurzes Ä („Äpfel“) klingt ohnehin wie E.
// Stufe 2: kurzer Satz, nur das Zielwort ändert sich.
// Stufe 3: längerer Satz mit zwei Wörtern mit dem Laut – nur eins davon wird falsch gesagt.

const SOUNDS = {
  ü: { label: 'Ü', swap: 'I', emoji: '🚪' },
  ä: { label: 'Ä', swap: 'E', emoji: '🐻' },
  ö: { label: 'Ö', swap: 'E', emoji: '🦁' },
  sch: { label: 'Sch', swap: 'S', emoji: '🐟' },
};

const LEVELS = {
  1: { stars: '⭐', label: 'Wörter' },
  2: { stars: '⭐⭐', label: 'Kurze Sätze' },
  3: { stars: '⭐⭐⭐', label: 'Lange Sätze' },
};

const CATALOG = {
  ü: {
    1: [
      ['Tür', '🚪', 'Tir'],
      ['Mütze', '🧢', 'Mitze'],
      ['Küche', '🍳', 'Kiche'],
      ['Brücke', '🌉', 'Bricke'],
      ['Schlüssel', '🔑', 'Schlissel'],
      ['Würfel', '🎲', 'Wirfel'],
      ['Füße', '🦶', 'Fieße'],
      ['Gemüse', '🥦', 'Gemiese'],
      ['Kürbis', '🎃', 'Kirbis'],
      ['Tüte', '🛍️', 'Tiete'],
      ['Zahnbürste', '🪥', 'Zahnbirste'],
      ['Hühner', '🐔', 'Hiehner'],
    ],
    2: [
      ['Mach die Tür zu.', '🚪', 'Mach die Tir zu.'],
      ['Die Mütze ist warm.', '🧢', 'Die Mitze ist warm.'],
      ['Ich esse Gemüse.', '🥦', 'Ich esse Gemiese.'],
      ['Der Schlüssel ist weg.', '🔑', 'Der Schlissel ist weg.'],
      ['Ich habe kalte Füße.', '🦶', 'Ich habe kalte Fieße.'],
      ['Papa kocht in der Küche.', '🍳', 'Papa kocht in der Kiche.'],
      ['Der Kürbis ist orange.', '🎃', 'Der Kirbis ist orange.'],
      ['Wo ist die Zahnbürste?', '🪥', 'Wo ist die Zahnbirste?'],
    ],
    3: [
      ['Die Mütze liegt in der Küche.', '🧢', 'Die Mütze liegt in der Kiche.'],
      ['Der Schlüssel steckt in der Tür.', '🔑', 'Der Schlissel steckt in der Tür.'],
      ['Über die Brücke fährt ein Auto.', '🌉', 'Über die Bricke fährt ein Auto.'],
      ['Die Hühner fressen Gemüse.', '🐔', 'Die Hühner fressen Gemiese.'],
      ['Nach dem Spielen sind meine Füße müde.', '🦶', 'Nach dem Spielen sind meine Fieße müde.'],
      ['In der Tüte ist ein Kürbis.', '🛍️', 'In der Tiete ist ein Kürbis.'],
    ],
  },
  ä: {
    1: [
      ['Käse', '🧀', 'Kese'],
      ['Bär', '🐻', 'Ber'],
      ['Mädchen', '👧', 'Medchen'],
      ['Säge', '🪚', 'Sege'],
      ['Zähne', '🦷', 'Zehne'],
      ['Räder', '🚲', 'Reder'],
      ['Käfer', '🐞', 'Kefer'],
      ['Träne', '😢', 'Trene'],
      ['Gläser', '🥛', 'Gleser'],
      ['Märchen', '📖', 'Merchen'],
      ['Kräne', '🏗️', 'Krene'],
    ],
    2: [
      ['Der Bär ist braun.', '🐻', 'Der Ber ist braun.'],
      ['Ich mag Käse.', '🧀', 'Ich mag Kese.'],
      ['Das Mädchen lacht.', '👧', 'Das Medchen lacht.'],
      ['Ich putze meine Zähne.', '🦷', 'Ich putze meine Zehne.'],
      ['Der Käfer krabbelt.', '🐞', 'Der Kefer krabbelt.'],
      ['Das Fahrrad hat zwei Räder.', '🚲', 'Das Fahrrad hat zwei Reder.'],
      ['Papa hat eine Säge.', '🪚', 'Papa hat eine Sege.'],
      ['Die Gläser sind voll.', '🥛', 'Die Gleser sind voll.'],
    ],
    3: [
      ['Der Bär isst gerne Käse.', '🧀', 'Der Bär isst gerne Kese.'],
      ['Das Mädchen hört ein Märchen.', '👧', 'Das Medchen hört ein Märchen.'],
      ['Der Käfer krabbelt über die Räder.', '🐞', 'Der Kefer krabbelt über die Räder.'],
      ['Nach dem Käse putze ich die Zähne.', '🦷', 'Nach dem Käse putze ich die Zehne.'],
      ['Der Bär hat große Zähne.', '🐻', 'Der Ber hat große Zähne.'],
      ['Die Kräne heben schwere Gläser.', '🏗️', 'Die Krene heben schwere Gläser.'],
    ],
  },
  ö: {
    1: [
      ['Löwe', '🦁', 'Lewe'],
      ['Löffel', '🥄', 'Leffel'],
      ['Vögel', '🐦', 'Vegel'],
      ['Möhre', '🥕', 'Mehre'],
      ['Brötchen', '🥖', 'Bretchen'],
      ['Frösche', '🐸', 'Fresche'],
      ['König', '👑', 'Kenig'],
      ['Schildkröte', '🐢', 'Schildkrete'],
      ['Hörnchen', '🥐', 'Hernchen'],
      ['Körbe', '🧺', 'Kerbe'],
    ],
    2: [
      ['Der Löwe ist stark.', '🦁', 'Der Lewe ist stark.'],
      ['Ich brauche einen Löffel.', '🥄', 'Ich brauche einen Leffel.'],
      ['Die Vögel singen.', '🐦', 'Die Vegel singen.'],
      ['Der Hase isst eine Möhre.', '🥕', 'Der Hase isst eine Mehre.'],
      ['Ich esse ein Brötchen.', '🥖', 'Ich esse ein Bretchen.'],
      ['Die Frösche quaken.', '🐸', 'Die Fresche quaken.'],
      ['Der König hat eine Krone.', '👑', 'Der Kenig hat eine Krone.'],
      ['Die Schildkröte ist langsam.', '🐢', 'Die Schildkrete ist langsam.'],
    ],
    3: [
      ['Der Löwe schläft neben dem König.', '🦁', 'Der Lewe schläft neben dem König.'],
      ['Ich esse die Möhre mit dem Löffel.', '🥕', 'Ich esse die Mehre mit dem Löffel.'],
      ['Die Vögel sehen die Frösche.', '🐸', 'Die Vögel sehen die Fresche.'],
      ['Die Schildkröte frisst eine Möhre.', '🐢', 'Die Schildkröte frisst eine Mehre.'],
      ['Der König isst ein Brötchen.', '👑', 'Der Kenig isst ein Brötchen.'],
      ['In den Körben liegen Hörnchen.', '🥐', 'In den Körben liegen Hernchen.'],
    ],
  },
  sch: {
    1: [
      ['Schokolade', '🍫', 'Sokolade'],
      ['Schuh', '👟', 'Suh'],
      ['Schaf', '🐑', 'Saf'],
      ['Schere', '✂️', 'Sere'],
      ['Schnecke', '🐌', 'Snecke'],
      ['Schwein', '🐷', 'Swein'],
      ['Schiff', '🚢', 'Siff'],
      ['Schlange', '🐍', 'Slange'],
      ['Fisch', '🐟', 'Fiss'],
      ['Flasche', '🍾', 'Flasse'],
      ['Dusche', '🚿', 'Duse'],
    ],
    2: [
      ['Der Fisch ist rot.', '🐟', 'Der Fiss ist rot.'],
      ['Ich esse Schokolade.', '🍫', 'Ich esse Sokolade.'],
      ['Wo ist mein Schuh?', '👟', 'Wo ist mein Suh?'],
      ['Das Schaf macht mäh.', '🐑', 'Das Saf macht mäh.'],
      ['Die Schnecke ist langsam.', '🐌', 'Die Snecke ist langsam.'],
      ['Das Schwein ist rosa.', '🐷', 'Das Swein ist rosa.'],
      ['Das Schiff ist groß.', '🚢', 'Das Siff ist groß.'],
      ['Ich gehe unter die Dusche.', '🚿', 'Ich gehe unter die Duse.'],
    ],
    3: [
      ['Der Fisch schwimmt unter dem Schiff.', '🚢', 'Der Fisch schwimmt unter dem Siff.'],
      ['Das Schaf und das Schwein spielen.', '🐷', 'Das Schaf und das Swein spielen.'],
      ['Die Schnecke kriecht auf meinen Schuh.', '🐌', 'Die Snecke kriecht auf meinen Schuh.'],
      ['Auf dem Tisch steht eine Flasche.', '🍾', 'Auf dem Tisch steht eine Flasse.'],
      ['Die Schlange schläft im Schatten.', '🐍', 'Die Slange schläft im Schatten.'],
      ['Mit der Schere schneide ich Papier.', '✂️', 'Mit der Sere schneide ich Papier.'],
    ],
  },
};
