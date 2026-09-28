# Baut woche.js: Essensplan, Rezepte und Einkaufsliste für eine Angebotswoche.
# Nährwerte werden aus der Zutatentabelle berechnet (pro 100 g: kcal, Protein, Kohlenhydrate, Fett).
# Aufruf: python3 tools/woche_bauen.py  → schreibt woche.js ins Repo.
import json, math, os

WOCHE_ID = '2026-KW40'
GUELTIG = '28.9. bis 3.10.2026'

N = {  # kcal, p, c, f pro 100 g
    'Hähnchenbrust': (110, 23, 0, 1.5), 'Putenschnitzel': (105, 24, 0, 1),
    'Rinderhack, mager': (125, 21, 0, 5), 'Lachsfilet': (200, 20, 0, 13),
    'Eier': (137, 12, 1, 9.3), 'Skyr': (63, 11, 4, 0.2), 'Magerquark': (67, 12, 4, 0.2),
    'Hüttenkäse': (98, 12, 3, 4.3), 'Frischkäse': (225, 5, 4, 21), 'Feta': (270, 17, 0.5, 22),
    'Milch 1,5 %': (47, 3.4, 4.9, 1.5), 'Protein-Milch': (57, 8, 4.8, 0.5),
    'Haferflocken': (370, 13.5, 59, 7), 'Banane': (96, 1.1, 22, 0.2), 'Himbeeren': (45, 1.2, 5, 0.3),
    'Mandarinen': (50, 0.7, 11, 0.2), 'Apfel': (54, 0.3, 12, 0.2), 'Kiwi gold': (63, 1, 14, 0.3),
    'Erdnussbutter': (610, 25, 14, 50), 'Mandeln': (600, 21, 6, 52), 'Honig': (305, 0.4, 76, 0),
    'Eiweißbrot': (260, 24, 8, 12), 'Vollkorntoast': (250, 9, 42, 4), 'Protein-Wraps': (265, 18, 33, 6),
    'High-Protein-Pasta (roh)': (350, 22, 55, 3), 'Nudeln (roh)': (355, 12.5, 71, 1.5),
    'Basmatireis (roh)': (350, 8, 77, 0.6), 'Kartoffeln': (72, 2, 15, 0.1),
    'Hokkaido-Kürbis': (63, 1.7, 12, 0.6), 'Butternut-Kürbis': (45, 1, 10, 0.1),
    'Karotten': (36, 0.9, 7, 0.2), 'Champignons': (22, 3, 0.6, 0.3), 'Zwiebel': (40, 1.2, 8, 0.2),
    'Lauch': (27, 2.2, 3.3, 0.3), 'Blumenkohl': (25, 2, 2.4, 0.3), 'Gurke': (13, 0.6, 1.8, 0.2),
    'Mini-Tomaten': (22, 1, 3, 0.2), 'Romanasalat': (16, 1.2, 1.7, 0.3), 'Avocado': (160, 2, 1.9, 15),
    'Edamame (geschält)': (125, 11, 5, 5.5), 'Passierte Tomaten': (30, 1.4, 5, 0.2),
    'Olivenöl': (884, 0, 0, 100), 'Leinöl': (884, 0, 0, 100), 'Sojasauce': (50, 6, 5, 0),
    'Gemüsebrühe': (0, 0, 0, 0), 'Gewürze': (0, 0, 0, 0), 'Kräuter': (0, 0, 0, 0), 'Zitrone': (0, 0, 0, 0),
}
FLEISCH = ('Hähnchen', 'Pute', 'Rinder', 'Lachs')

def nutr(ing):
    t = [0, 0, 0, 0]
    for name, g in ing:
        k = N[name]
        for i in range(4): t[i] += k[i] * g / 100
    return [round(x) for x in t]

# Rezepte: key → (Name, Mahlzeit, Minuten, Zutaten, Schritte)
R = {
 'skyr_himbeer_bowl': ('Skyr-Bowl mit Himbeeren & Haferflocken', 'breakfast', 5,
   [('Skyr', 250), ('Haferflocken', 40), ('Himbeeren', 80), ('Honig', 5)],
   ['Skyr in eine Schüssel geben und glatt rühren.', 'Haferflocken und Himbeeren darauf verteilen.', 'Mit etwas Honig beträufeln.']),
 'ruehrei_eiweissbrot': ('Rührei auf Eiweißbrot mit Mini-Tomaten', 'breakfast', 10,
   [('Eier', 120), ('Eiweißbrot', 60), ('Mini-Tomaten', 100), ('Olivenöl', 3), ('Gewürze', 0)],
   ['Eier verquirlen, salzen und pfeffern.', 'In wenig Öl bei mittlerer Hitze stocken lassen, dabei langsam rühren.', 'Brot rösten, Rührei darauf geben, Tomaten halbieren und dazu essen.']),
 'overnight_oats_skyr': ('Overnight Oats mit Skyr & Banane', 'breakfast', 5,
   [('Haferflocken', 45), ('Skyr', 150), ('Milch 1,5 %', 100), ('Banane', 60)],
   ['Haferflocken, Skyr und Milch in einem Glas verrühren.', 'Abgedeckt über Nacht in den Kühlschrank stellen.', 'Morgens mit Bananenscheiben belegen.']),
 'quark_mandarinen': ('Quark-Bowl mit Mandarinen & Haferflocken', 'breakfast', 5,
   [('Magerquark', 250), ('Haferflocken', 35), ('Mandarinen', 100), ('Mandeln', 5)],
   ['Quark mit einem Schuss Wasser cremig rühren.', 'Mandarinen schälen und in Stücke teilen.', 'Mit Haferflocken und gehackten Mandeln auf dem Quark verteilen.']),
 'eiweissbrot_huettenkaese': ('Eiweißbrot mit Hüttenkäse, Gurke & Tomate', 'breakfast', 5,
   [('Eiweißbrot', 80), ('Hüttenkäse', 150), ('Gurke', 80), ('Mini-Tomaten', 60), ('Gewürze', 0)],
   ['Brot in Scheiben schneiden, nach Wunsch toasten.', 'Hüttenkäse daraufstreichen.', 'Mit Gurken- und Tomatenscheiben belegen, pfeffern.']),
 'protein_pancakes': ('Protein-Pancakes mit Quark & Himbeeren', 'breakfast', 20,
   [('Haferflocken', 40), ('Eier', 60), ('Magerquark', 100), ('Himbeeren', 60), ('Honig', 10)],
   ['Haferflocken fein mahlen, mit Ei und der Hälfte vom Quark zu einem Teig verrühren.', 'In einer beschichteten Pfanne kleine Pancakes von beiden Seiten goldbraun backen.', 'Mit restlichem Quark, Himbeeren und Honig servieren.']),
 'ruehrei_champignons': ('Rührei mit Champignons & Vollkorntoast', 'breakfast', 15,
   [('Eier', 150), ('Champignons', 100), ('Vollkorntoast', 50), ('Olivenöl', 3), ('Gewürze', 0)],
   ['Champignons in Scheiben schneiden und in Öl anbraten.', 'Verquirlte Eier dazugeben und bei mittlerer Hitze stocken lassen.', 'Mit Toast servieren.']),

 'haehnchen_reis_pfanne': ('Hähnchen-Gemüse-Pfanne mit Reis', 'lunch', 25,
   [('Hähnchenbrust', 150), ('Basmatireis (roh)', 60), ('Karotten', 100), ('Champignons', 100), ('Zwiebel', 40), ('Olivenöl', 8), ('Gewürze', 0)],
   ['Reis nach Packungsanleitung kochen.', 'Hähnchen in Streifen schneiden und in Öl scharf anbraten, herausnehmen.', 'Zwiebel, Karotten und Champignons 6 Minuten braten, Hähnchen zurückgeben, würzen.', 'Mit dem Reis anrichten.']),
 'bolognese_proteinpasta': ('Pasta Bolognese mit magerem Rinderhack', 'lunch', 30,
   [('High-Protein-Pasta (roh)', 65), ('Rinderhack, mager', 125), ('Passierte Tomaten', 200), ('Karotten', 60), ('Zwiebel', 40), ('Olivenöl', 5), ('Gewürze', 0)],
   ['Zwiebel und Karotten fein würfeln, in Öl anschwitzen.', 'Hack dazugeben und krümelig braten.', 'Passierte Tomaten zugeben, würzen und 15 Minuten köcheln lassen.', 'Pasta kochen und mit der Sauce mischen.']),
 'haehnchen_wraps': ('Hähnchen-Wraps mit Salat & Hüttenkäse', 'lunch', 20,
   [('Protein-Wraps', 80), ('Hähnchenbrust', 120), ('Romanasalat', 40), ('Gurke', 60), ('Mini-Tomaten', 60), ('Hüttenkäse', 60), ('Olivenöl', 5), ('Gewürze', 0)],
   ['Hähnchen in Streifen schneiden, würzen und in Öl durchbraten.', 'Salat, Gurke und Tomaten klein schneiden.', 'Wraps kurz erwärmen, mit Hüttenkäse bestreichen, füllen und einrollen.']),
 'putenschnitzel_kartoffeln': ('Puten-Schnitzel mit Kartoffeln & Blumenkohl', 'lunch', 30,
   [('Putenschnitzel', 150), ('Kartoffeln', 250), ('Blumenkohl', 200), ('Olivenöl', 10), ('Gewürze', 0)],
   ['Kartoffeln kochen oder als Spalten im Ofen backen.', 'Blumenkohl in Röschen teilen und 8 Minuten dämpfen.', 'Schnitzel würzen und in Öl von jeder Seite 3 bis 4 Minuten braten.']),
 'haehnchen_bowl': ('Hähnchen-Bowl mit Reis, Avocado & Gurke', 'lunch', 25,
   [('Hähnchenbrust', 130), ('Basmatireis (roh)', 60), ('Gurke', 80), ('Karotten', 60), ('Avocado', 50), ('Sojasauce', 10)],
   ['Reis kochen.', 'Hähnchen würzen, braten und in Scheiben schneiden.', 'Gurke, Karotte und Avocado schneiden.', 'Alles in einer Schüssel anrichten, mit Sojasauce beträufeln.']),
 'kuerbis_curry': ('Kürbis-Hähnchen-Curry mit Reis', 'lunch', 30,
   [('Hähnchenbrust', 130), ('Butternut-Kürbis', 200), ('Passierte Tomaten', 100), ('Zwiebel', 40), ('Basmatireis (roh)', 50), ('Olivenöl', 8), ('Gewürze', 0)],
   ['Reis kochen. Kürbis schälen und würfeln.', 'Zwiebel und Hähnchenwürfel in Öl anbraten, mit Currypulver würzen.', 'Kürbis und passierte Tomaten dazugeben, 15 Minuten köcheln lassen.', 'Mit Reis servieren.']),
 'lachs_pasta': ('Lachs-Pasta mit Mini-Tomaten', 'lunch', 20,
   [('Lachsfilet', 100), ('Nudeln (roh)', 60), ('Mini-Tomaten', 120), ('Frischkäse', 25), ('Zitrone', 0), ('Gewürze', 0)],
   ['Nudeln kochen, eine Tasse Kochwasser aufheben.', 'Lachs würfeln und in einer Pfanne 4 Minuten braten.', 'Halbierte Tomaten, Frischkäse und etwas Kochwasser dazugeben, mit Zitrone abschmecken.', 'Nudeln untermischen.']),

 'kuerbissuppe': ('Kürbissuppe mit körnigem Frischkäse', 'dinner', 30,
   [('Hokkaido-Kürbis', 250), ('Karotten', 60), ('Zwiebel', 30), ('Olivenöl', 5), ('Gemüsebrühe', 300), ('Hüttenkäse', 150), ('Eiweißbrot', 30)],
   ['Hokkaido mit Schale würfeln, Karotten und Zwiebel klein schneiden.', 'In Öl anschwitzen, mit Brühe aufgießen und 20 Minuten köcheln.', 'Fein pürieren und würzen.', 'Mit körnigem Frischkäse und Eiweißbrot servieren.']),
 'omelett_champignons': ('Champignon-Omelett mit Salat & Feta', 'dinner', 15,
   [('Eier', 180), ('Champignons', 120), ('Mini-Tomaten', 80), ('Romanasalat', 80), ('Feta', 20), ('Olivenöl', 5)],
   ['Champignons in Öl anbraten.', 'Verquirlte Eier darübergießen und bei kleiner Hitze stocken lassen.', 'Salat und Tomaten schneiden, Feta darüberbröseln und zum Omelett essen.']),
 'lachs_ofenkuerbis': ('Lachs mit Ofen-Kürbis & Kartoffeln', 'dinner', 35,
   [('Lachsfilet', 100), ('Hokkaido-Kürbis', 200), ('Kartoffeln', 120), ('Olivenöl', 5), ('Gewürze', 0)],
   ['Kürbis und Kartoffeln in Spalten schneiden, mit Öl und Salz mischen.', 'Bei 200 °C 25 Minuten backen.', 'Lachs würzen, für die letzten 12 Minuten mit aufs Blech legen.']),
 'blumenkohl_curry': ('Blumenkohl-Curry mit Edamame & Reis', 'dinner', 25,
   [('Blumenkohl', 250), ('Edamame (geschält)', 100), ('Passierte Tomaten', 150), ('Zwiebel', 40), ('Basmatireis (roh)', 40), ('Olivenöl', 5), ('Gewürze', 0)],
   ['Reis kochen.', 'Zwiebel in Öl anschwitzen, Currypulver kurz mitrösten.', 'Blumenkohlröschen, Edamame und passierte Tomaten dazugeben, 12 Minuten köcheln.', 'Mit Reis servieren.']),
 'rinderhack_kartoffel_pfanne': ('Rinderhack-Kartoffel-Pfanne mit Lauch', 'dinner', 30,
   [('Rinderhack, mager', 120), ('Kartoffeln', 200), ('Lauch', 150), ('Zwiebel', 30), ('Olivenöl', 6), ('Skyr', 50), ('Gewürze', 0)],
   ['Kartoffeln würfeln und in Öl 15 Minuten braten.', 'Hack und Zwiebel dazugeben und krümelig braten.', 'Lauch in Ringen zugeben, 5 Minuten mitbraten, würzen.', 'Mit einem Klecks Skyr servieren.']),
 'ofengemuese_feta': ('Ofengemüse mit Feta & Kräuter-Skyr', 'dinner', 35,
   [('Hokkaido-Kürbis', 150), ('Karotten', 100), ('Zwiebel', 50), ('Kartoffeln', 100), ('Feta', 45), ('Olivenöl', 6), ('Skyr', 100), ('Kräuter', 0)],
   ['Gemüse in Stücke schneiden, mit Öl und Salz aufs Blech geben.', 'Bei 200 °C 25 Minuten backen.', 'Feta darüberbröseln und 5 Minuten mitbacken.', 'Skyr mit Kräutern verrühren und dazu servieren.']),
 'quark_kartoffeln': ('Kräuterquark mit Pellkartoffeln & Gurkensalat', 'dinner', 25,
   [('Kartoffeln', 250), ('Magerquark', 200), ('Gurke', 150), ('Leinöl', 8), ('Kräuter', 0)],
   ['Kartoffeln mit Schale 20 Minuten kochen.', 'Quark mit Kräutern, Salz und etwas Wasser glatt rühren.', 'Gurke hobeln, mit Salz und Pfeffer anmachen.', 'Leinöl über den Quark geben.']),

 'skyr_himbeeren': ('Skyr mit Himbeeren', 'snack', 2, [('Skyr', 150), ('Himbeeren', 80)], ['Skyr mit Himbeeren in eine Schale geben.']),
 'apfel_quark': ('Apfel mit Magerquark', 'snack', 3, [('Apfel', 150), ('Magerquark', 100)], ['Apfel in Spalten schneiden und in den Quark dippen.']),
 'mandarinen_mandeln': ('Mandarinen & Mandeln', 'snack', 1, [('Mandarinen', 150), ('Mandeln', 12)], ['Mandarinen schälen, Mandeln dazu essen.']),
 'huettenkaese_gurke': ('Hüttenkäse mit Gurke & Tomaten', 'snack', 3, [('Hüttenkäse', 100), ('Gurke', 150), ('Mini-Tomaten', 50)], ['Gemüse schneiden und mit Hüttenkäse essen.']),
 'kiwi_skyr': ('Kiwi mit Skyr', 'snack', 3, [('Kiwi gold', 100), ('Skyr', 120)], ['Kiwi schälen, würfeln und auf den Skyr geben.']),
 'proteinmilch': ('Protein-Milch', 'snack', 1, [('Protein-Milch', 250)], ['Gut gekühlt trinken.']),
 'karotten_dip': ('Karottensticks mit Frischkäse-Dip', 'snack', 5, [('Karotten', 150), ('Frischkäse', 25), ('Skyr', 50)], ['Karotten in Stifte schneiden.', 'Frischkäse mit Skyr verrühren und dazu dippen.']),
 'shake_banane': ('Protein-Shake mit Banane & Haferflocken', 'snack', 3, [('Protein-Milch', 400), ('Banane', 120), ('Haferflocken', 30)], ['Alles im Mixer fein pürieren.']),
 'brot_erdnuss': ('Vollkorntoast mit Erdnussbutter & Banane', 'snack', 3, [('Vollkorntoast', 80), ('Erdnussbutter', 25), ('Banane', 100)], ['Toast mit Erdnussbutter bestreichen und mit Bananenscheiben belegen.']),
 'quark_hafer': ('Quark mit Haferflocken, Honig & Himbeeren', 'snack', 3, [('Magerquark', 250), ('Haferflocken', 50), ('Honig', 15), ('Himbeeren', 60)], ['Quark cremig rühren, Haferflocken, Himbeeren und Honig darauf geben.']),
 'eiweissbrot_snack': ('Eiweißbrot mit Hüttenkäse & Apfel', 'snack', 3, [('Eiweißbrot', 80), ('Hüttenkäse', 150), ('Apfel', 150)], ['Brot mit Hüttenkäse bestreichen, Apfel dazu essen.']),
}

# Wochenplan Mo bis So: Frühstück, Mittag, Abend, Snack Tami, Snack Cristian
TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
PLAN = [
 ('skyr_himbeer_bowl', 'haehnchen_reis_pfanne', 'kuerbissuppe', 'skyr_himbeeren', 'shake_banane'),
 ('ruehrei_eiweissbrot', 'bolognese_proteinpasta', 'omelett_champignons', 'apfel_quark', 'brot_erdnuss'),
 ('overnight_oats_skyr', 'haehnchen_wraps', 'lachs_ofenkuerbis', 'mandarinen_mandeln', 'quark_hafer'),
 ('quark_mandarinen', 'putenschnitzel_kartoffeln', 'blumenkohl_curry', 'huettenkaese_gurke', 'eiweissbrot_snack'),
 ('eiweissbrot_huettenkaese', 'haehnchen_bowl', 'rinderhack_kartoffel_pfanne', 'kiwi_skyr', 'shake_banane'),
 ('protein_pancakes', 'kuerbis_curry', 'ofengemuese_feta', 'proteinmilch', 'brot_erdnuss'),
 ('ruehrei_champignons', 'lachs_pasta', 'quark_kartoffeln', 'karotten_dip', 'quark_hafer'),
]
# Extras: Tag → Mahlzeit → [(wer, Zutat, Gramm)]  (negative Gramm = weniger)
C = 'Cristian'
EX = {
 0: {'breakfast': [(C, 'Haferflocken', 40), (C, 'Banane', 120), (C, 'Erdnussbutter', 20)],
     'lunch': [(C, 'Basmatireis (roh)', 80), (C, 'Hähnchenbrust', 40), (C, 'Olivenöl', 7)],
     'dinner': [(C, 'Eiweißbrot', 60), (C, 'Hüttenkäse', 100)]},
 1: {'breakfast': [(C, 'Eier', 120), (C, 'Vollkorntoast', 60), (C, 'Avocado', 20)],
     'lunch': [(C, 'High-Protein-Pasta (roh)', 105), (C, 'Rinderhack, mager', 30), (C, 'Olivenöl', 5)],
     'dinner': [(C, 'Eier', 120), (C, 'Vollkorntoast', 40)]},
 2: {'breakfast': [(C, 'Haferflocken', 40), (C, 'Milch 1,5 %', 150), (C, 'Erdnussbutter', 20), (C, 'Banane', 60)],
     'lunch': [(C, 'Protein-Wraps', 80), (C, 'Hähnchenbrust', 40), (C, 'Avocado', 40), (C, 'Banane', 70)],
     'dinner': [(C, 'Lachsfilet', 50), (C, 'Kartoffeln', 120), (C, 'Olivenöl', 5), (C, 'Skyr', 100)]},
 3: {'breakfast': [(C, 'Haferflocken', 50), (C, 'Mandeln', 20), (C, 'Honig', 15)],
     'lunch': [(C, 'Kartoffeln', 250), (C, 'Putenschnitzel', 100), (C, 'Olivenöl', 8)],
     'dinner': [(C, 'Basmatireis (roh)', 80), (C, 'Edamame (geschält)', 80)]},
 4: {'breakfast': [(C, 'Vollkorntoast', 40), (C, 'Hüttenkäse', 100), (C, 'Banane', 100)],
     'lunch': [(C, 'Basmatireis (roh)', 75), (C, 'Hähnchenbrust', 30), (C, 'Avocado', 50)],
     'dinner': [(C, 'Kartoffeln', 250), (C, 'Rinderhack, mager', 80), (C, 'Olivenöl', 6), (C, 'Skyr', 100)]},
 5: {'breakfast': [(C, 'Haferflocken', 40), (C, 'Eier', 60), (C, 'Magerquark', 100), (C, 'Erdnussbutter', 15)],
     'lunch': [(C, 'Basmatireis (roh)', 75), (C, 'Hähnchenbrust', 30), (C, 'Olivenöl', 5)],
     'dinner': [(C, 'Feta', 50), (C, 'Kartoffeln', 200)]},
 6: {'breakfast': [(C, 'Eier', 120), (C, 'Vollkorntoast', 20), (C, 'Mandarinen', 150)],
     'lunch': [(C, 'Nudeln (roh)', 90), (C, 'Lachsfilet', 50), (C, 'Frischkäse', 15)],
     'dinner': [(C, 'Kartoffeln', 260), (C, 'Magerquark', 150), (C, 'Leinöl', 8)]},
}

db = {}
for k, (name, meal, mins, ing, steps) in R.items():
    kc, p, c, f = nutr(ing)
    db[k] = {'name': name, 'meal': meal, 'min': mins, 'g': sum(g for _, g in ing), 'kcal': kc, 'p': p, 'c': c, 'f': f,
             'ing': [[n, g] for n, g in ing], 'steps': steps}

def tag(k):
    r = db[k]
    if r['p'] * 4 / max(1, r['kcal']) >= 0.28: return 'high-protein'
    if not any(any(m in n for m in FLEISCH) for n, _ in r['ing']): return 'vegetarisch'
    return 'ausgewogen'

def short(n): return n.replace(' (roh)', '').replace(' (geschält)', '').replace(', mager', '')

extras = {}
for d, meals in EX.items():
    extras[str(d)] = {}
    for meal, items in meals.items():
        out = []
        for who, n, g in items:
            kc, p, c, f = nutr([(n, abs(g))])
            s = -1 if g < 0 else 1
            out.append({'who': who, 'type': '-' if g < 0 else '+', 'name': n, 'g': g, 'note': '',
                        'kcal': s * kc, 'p': s * p, 'c': s * c, 'f': s * f})
        extras[str(d)][meal] = out

def ex_text(items):
    return ', '.join(('weniger ' if x['type'] == '-' else '+ ') + short(x['name']) for x in items)

week = []
for d, (b, l, dn, st, sc) in enumerate(PLAN):
    e = extras.get(str(d), {})
    def summary(meal):
        items = e.get(meal, [])
        if not items: return {'who': 'Cristian', 'text': 'gleiche Portion', 'kcal': '+ 0 kcal'}
        whos = sorted(set(x['who'] for x in items), key=lambda w: -abs(sum(x['kcal'] for x in items if x['who'] == w)))
        w = whos[0]; its = [x for x in items if x['who'] == w]; k = sum(x['kcal'] for x in its)
        return {'who': w, 'text': ex_text(its), 'kcal': ('+ ' if k >= 0 else '− ') + str(abs(k)) + ' kcal'}
    li = e.get('lunch', [])
    def pers(w):
        its = [x for x in li if x['who'] == w]; k = sum(x['kcal'] for x in its)
        tot = db[l]['kcal'] + k
        its2 = [x for x in its if 'öl' not in x['name']]
        return {'desc': ('größere Portion: ' + ex_text(its2)) if its2 else 'normale Portion', 'f': round(tot / db[l]['kcal'], 2), 'kcal': str(tot) + ' kcal'}
    week.append({
        'short': TAGE[d], 'bx': summary('breakfast'), 'dx': summary('dinner'),
        'breakfast': {'key': b, 'name': db[b]['name'], 'kcal': str(db[b]['kcal']) + ' kcal', 'tag': tag(b)},
        'lunch': {'key': l, 'name': db[l]['name'], 'tami': pers('Tami'), 'cristian': pers('Cristian')},
        'dinner': {'key': dn, 'name': db[dn]['name'], 'kcal': str(db[dn]['kcal']) + ' kcal', 'tag': tag(dn)},
        'snackCristian': {'key': sc, 'desc': db[sc]['name'], 'kcal': str(db[sc]['kcal']) + ' kcal'},
        'snackTami': {'key': st, 'desc': db[st]['name'], 'kcal': str(db[st]['kcal']) + ' kcal'},
    })

def alt(k, label): return [db[k]['name'], str(db[k]['kcal']) + ' kcal · ' + label, k]
alts = {
 'snack': [alt('apfel_quark', 'leicht'), alt('skyr_himbeeren', 'proteinreich'), alt('shake_banane', 'für Muskelaufbau')],
 'breakfast': [alt('overnight_oats_skyr', 'zum Vorbereiten'), alt('ruehrei_eiweissbrot', 'high-protein'), alt('quark_mandarinen', 'schnell')],
 'lunch': [alt('haehnchen_bowl', 'high-protein'), alt('putenschnitzel_kartoffeln', 'klassisch'), alt('haehnchen_wraps', 'schnell')],
 'dinner': [alt('omelett_champignons', 'vegetarisch'), alt('quark_kartoffeln', 'vegetarisch'), alt('blumenkohl_curry', 'vegan')],
}

# ── Mengen für den Haushalt: beide essen das Grundrezept, dazu die Extras ──
need = {}
def add(n, g): need[n] = need.get(n, 0) + g
for d, (b, l, dn, st, sc) in enumerate(PLAN):
    for k in (b, l, dn):
        for n, g in db[k]['ing']: add(n, 2 * g)
    for k in (st, sc):
        for n, g in db[k]['ing']: add(n, g)
    for meal, items in extras.get(str(d), {}).items():
        for x in items: add(x['name'], x['g'])

# ── Einkaufsliste: Artikel mit Packung, Preisen je Markt und Angebot ──
# Preise: Angebotspreise aus den Prospekten KW 40, sonst Richtwerte für den Normalpreis.
M = ['rewe', 'edeka', 'netto', 'kaufland', 'lidl', 'aldi']
# Pro Artikel: Normalpreis (Richtwert, gilt überall ohne Angebot) und die echten Angebotspreise aus den Prospekten.
# So entscheiden nur echte Angebote, in welchem Laden etwas günstiger ist.
KAT = [
 # id, Zutat(en), Packung (g), Label, Normalpreis, {Markt: Angebotspreis}
 ('huhn', ['Hähnchenbrust'], 1000, 'Hähnchenbrustfilet, {n} × 1 kg', 12.99, {'rewe': 9.99, 'edeka': 11.10}),
 ('pute', ['Putenschnitzel'], 500, 'Puten-Schnitzel, {n} × 500 g (Theke)', 7.45, {'edeka': 5.95}),
 ('rind', ['Rinderhack, mager'], 400, 'Rinderhack fettreduziert, {n} × 400 g', 7.99, {'edeka': 6.99}),
 ('lachs', ['Lachsfilet'], 250, 'Lachsfilet, {n} × 250 g', 6.99, {'rewe': 5.19}),
 ('eier', ['Eier'], 600, 'Eier, {n} × 10 Stück', 3.19, {}),
 ('skyr', ['Skyr'], 350, 'Skyr Natur, {n} × 350 g', 1.29, {'edeka': 0.99}),
 ('quark', ['Magerquark'], 500, 'Magerquark, {n} × 500 g', 1.79, {'rewe': 1.49}),
 ('huettenkaese', ['Hüttenkäse'], 200, 'Hüttenkäse, {n} × 200 g', 1.69, {'edeka': 1.29}),
 ('frischkaese', ['Frischkäse'], 175, 'Frischkäse, {n} Packung', 2.29, {'netto': 0.99, 'kaufland': 1.00}),
 ('feta', ['Feta'], 150, 'Feta, {n} × 150 g', 2.49, {'edeka': 2.11}),
 ('proteinmilch', ['Protein-Milch'], 1000, 'High Protein Milch, {n} × 1 l', 1.79, {'edeka': 1.49}),
 ('milch', ['Milch 1,5 %'], 1000, 'Milch 1,5 %, {n} × 1 l', 1.19, {'rewe': 1.11}),
 ('hafer', ['Haferflocken'], 500, 'Haferflocken, {n} × 500 g', 0.99, {}),
 ('eiweissbrot', ['Eiweißbrot'], 500, 'Eiweißbrot, {n} × 500 g', 3.49, {'edeka': 2.99}),
 ('toast', ['Vollkorntoast'], 750, 'Vollkorntoast, {n} × 750 g', 1.89, {'edeka': 1.49}),
 ('wraps', ['Protein-Wraps'], 320, 'Protein Wraps, {n} × 8 Stück', 2.29, {'edeka': 1.49}),
 ('hppasta', ['High-Protein-Pasta (roh)'], 500, 'High Protein Pasta, {n} × 500 g', 2.99, {'edeka': 2.49}),
 ('nudeln', ['Nudeln (roh)'], 500, 'Nudeln, {n} × 500 g', 1.29, {'rewe': 0.99, 'edeka': 0.85}),
 ('reis', ['Basmatireis (roh)'], 1000, 'Basmatireis, {n} × 1 kg', 2.49, {}),
 ('kartoffeln', ['Kartoffeln'], 1500, 'Kartoffeln, {n} × 1,5 kg', 2.49, {'rewe': 1.19}),
 ('hokkaido', ['Hokkaido-Kürbis'], 1000, 'Hokkaido-Kürbis, {n} × ca. 1 kg', 1.99, {'rewe': 1.39, 'edeka': 1.49}),
 ('butternut', ['Butternut-Kürbis'], 1000, 'Butternut-Kürbis, {n} × ca. 1 kg', 2.49, {'rewe': 1.19}),
 ('karotten', ['Karotten'], 1000, 'Karotten, {n} × 1 kg', 1.29, {'rewe': 0.95}),
 ('champignons', ['Champignons'], 400, 'Champignons, {n} × 400 g', 2.29, {'rewe': 1.59}),
 ('zwiebeln', ['Zwiebel'], 2000, 'Zwiebeln, {n} × 2 kg', 2.29, {'edeka': 1.59}),
 ('lauch', ['Lauch'], 500, 'Lauch, {n} × ca. 500 g', 1.29, {'edeka': 1.00}),
 ('blumenkohl', ['Blumenkohl'], 800, 'Blumenkohl, {n} Stück', 1.99, {'netto': 1.00, 'edeka': 1.00}),
 ('gurke', ['Gurke'], 400, 'Salatgurke, {n} Stück', 0.79, {'edeka': 0.59}),
 ('tomaten', ['Mini-Tomaten'], 500, 'Mini-Tomaten, {n} × 500 g', 2.79, {'edeka': 1.88, 'netto': 1.99}),
 ('romana', ['Romanasalat'], 400, 'Romana-Salatherzen, {n} × 3 Stück', 1.79, {'rewe': 1.29}),
 ('avocado', ['Avocado'], 170, 'Avocado, {n} Stück', 1.49, {'rewe': 1.19}),
 ('passiert', ['Passierte Tomaten'], 2000, 'Passierte Tomaten, {n} × 4 × 500 g', 3.56, {'netto': 2.00}),
 ('edamame', ['Edamame (geschält)'], 400, 'Edamame geschält (TK), {n} × 400 g', 2.49, {'edeka': 1.99}),
 ('bananen', ['Banane'], 1000, 'Bananen, {n} × ca. 1 kg', 1.99, {'rewe': 1.79}),
 ('himbeeren', ['Himbeeren'], 125, 'Himbeeren, {n} × 125 g', 2.49, {'edeka': 1.99}),
 ('mandarinen', ['Mandarinen'], 750, 'Mandarinen, {n} × 750-g-Netz', 2.49, {'kaufland': 1.39}),
 ('aepfel', ['Apfel'], 2000, 'Äpfel, {n} × 2-kg-Beutel', 4.49, {'rewe': 2.22}),
 ('kiwi', ['Kiwi gold'], 100, 'Kiwi gold, {n} Stück', 0.79, {'netto': 0.59}),
 # Vorrat, standardmäßig nicht auf der Liste
 ('mandeln', ['Mandeln'], 200, 'Mandeln, {n} × 200 g', 2.99, {}),
 ('erdnuss', ['Erdnussbutter'], 350, 'Erdnussbutter, {n} Glas', 3.29, {}),
 ('olivenoel', ['Olivenöl'], 500, 'Olivenöl, {n} × 500 ml', 7.49, {'rewe': 5.99}),
 ('honig', ['Honig'], 500, 'Honig, {n} Glas', 3.99, {}),
 ('leinoel', ['Leinöl'], 250, 'Leinöl, {n} Flasche', 3.49, {}),
 ('sojasauce', ['Sojasauce'], 250, 'Sojasauce, {n} Flasche', 1.39, {}),
]

KAT_GRUPPE = {
 'Obst & Gemüse': ['kartoffeln', 'hokkaido', 'butternut', 'karotten', 'champignons', 'zwiebeln', 'lauch', 'blumenkohl', 'gurke', 'tomaten', 'romana', 'avocado', 'bananen', 'himbeeren', 'mandarinen', 'aepfel', 'kiwi'],
 'Fleisch & Fisch': ['huhn', 'pute', 'rind', 'lachs'],
 'Kühlregal': ['eier', 'skyr', 'quark', 'huettenkaese', 'frischkaese', 'feta', 'proteinmilch', 'milch'],
 'Brot & Backwaren': ['eiweissbrot', 'toast', 'wraps'],
 'Nudeln, Reis & Vorrat': ['hppasta', 'nudeln', 'reis', 'hafer', 'passiert', 'mandeln', 'erdnuss', 'olivenoel', 'honig', 'leinoel', 'sojasauce'],
 'Tiefkühl': ['edamame'],
}
KAT_REIHE = list(KAT_GRUPPE)
def gruppe(cid):
    for g, ids in KAT_GRUPPE.items():
        if cid in ids: return g
    return 'Sonstiges'
VORRAT = {'mandeln', 'erdnuss', 'olivenoel', 'honig', 'leinoel', 'sojasauce'}

def fmt_amount(n, g):
    if n in ('Eier',): return str(math.ceil(g / 60)) + ' Stück'
    if n in ('Avocado',): return str(math.ceil(g / 170)) + ' Stück'
    if n in ('Gurke',): return str(math.ceil(g / 400)) + ' Stück'
    if n in ('Kiwi gold',): return str(math.ceil(g / 100)) + ' Stück'
    if 'Milch' in n or 'öl' in n or n == 'Sojasauce':
        return (str(round(g / 1000, 1)).replace('.', ',') + ' l') if g >= 1000 else str(round(g)) + ' ml'
    return (str(round(g / 1000, 1)).replace('.', ',') + ' kg') if g >= 1000 else str(round(g)) + ' g'

# wofür: in welchen Gerichten die Zutat vorkommt
uses = {}
for d, row in enumerate(PLAN):
    for k in row:
        for n, g in db[k]['ing']:
            uses.setdefault(n, [])
            lab = TAGE[d] + ' ' + db[k]['name'].split(' mit ')[0]
            if lab not in uses[n]: uses[n].append(lab)

catalog, needTxt, onList = [], {}, []
for cid, ings, pack, label, reg, offers in KAT:
    g = sum(need.get(n, 0) for n in ings)
    cnt = max(1, math.ceil(g / pack - 0.05))
    pr = {m: round(offers.get(m, reg) * cnt, 2) for m in M}
    offer = min(offers, key=offers.get) if offers else None
    u = uses.get(ings[0], [])
    note = ', '.join(u[:3]) + (' u. a.' if len(u) > 3 else '')
    catalog.append({'id': cid, 'label': label.format(n=cnt), 'note': note or 'Vorrat', 'cat': gruppe(cid), 'prices': pr, 'offer': offer})
    if g > 0: needTxt[cid] = fmt_amount(ings[0], g)
    if g > 0 and cid not in VORRAT: onList.append(cid)

W = {
    'id': WOCHE_ID, 'gueltig': GUELTIG,
    'markets': [{'id': 'rewe', 'name': 'Rewe'}, {'id': 'edeka', 'name': 'Edeka'}, {'id': 'netto', 'name': 'Netto'}, {'id': 'kaufland', 'name': 'Kaufland'}],
    'extraMarkets': [{'id': 'lidl', 'name': 'Lidl', 'type': 'Discounter'}, {'id': 'aldi', 'name': 'Aldi Süd', 'type': 'Discounter'}],
    'week': week, 'mealAlts': alts, 'db': db, 'extras': extras,
    'catalog': sorted(catalog, key=lambda c: KAT_REIHE.index(c['cat']) if c['cat'] in KAT_REIHE else 99), 'catOrder': KAT_REIHE + ['Sonstiges'], 'need': needTxt, 'onList': onList,
}
root = os.path.join(os.path.dirname(__file__), '..')
with open(os.path.join(root, 'woche.js'), 'w') as fh:
    fh.write('/* Vita Wochenplan ' + WOCHE_ID + ' (' + GUELTIG + '), erzeugt mit tools/woche_bauen.py */\n')
    fh.write('window.VITA_WOCHE = ' + json.dumps(W, ensure_ascii=False) + ';\n')

if __name__ == '__main__':
    for d, (b, l, dn, st, sc) in enumerate(PLAN):
        e = extras.get(str(d), {})
        ext = sum(x['kcal'] for m in e.values() for x in m)
        t = db[b]['kcal'] + db[l]['kcal'] + db[dn]['kcal']
        print(TAGE[d], 'Tami', t + db[st]['kcal'], 'P', db[b]['p'] + db[l]['p'] + db[dn]['p'] + db[st]['p'],
              '| Cristian', t + db[sc]['kcal'] + ext, 'P', db[b]['p'] + db[l]['p'] + db[dn]['p'] + db[sc]['p'] + sum(x['p'] for m in e.values() for x in m if x['who']=='Cristian'))
    for c in catalog: print(c['id'], needTxt.get(c['id'], '-'), c['label'], c['prices'])
