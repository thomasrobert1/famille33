"""
Test de fumée de l'interface (Playwright, Chromium) avec le faux Supabase.
Parcourt toutes les pages sur ordinateur et téléphone, réalise des captures
dans tests/e2e/screenshots/ et échoue si une erreur JavaScript apparaît.

  npm run test:e2e        (compile puis lance ce script)
"""
import sys, re, pathlib, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

DIST = pathlib.Path(__file__).parent / ".dist"
if not (DIST / "index.html").exists():
    sys.exit("Compilez d'abord : npm run build:e2e")
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
handler = functools.partial(QuietHandler, directory=str(DIST))
server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_address[1]}/index.html"
OUT = pathlib.Path(__file__).parent / "screenshots"
OUT.mkdir(exist_ok=True)
errors = []

def watch(page, label):
    page.on("pageerror", lambda e: errors.append(f"[{label}] {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"[{label}] console: {m.text}"))

def login_admin(page):
    """Connexion à l'espace d'administration (les visiteurs n'ont pas de compte)."""
    page.evaluate("location.hash = '#/admin'")
    page.wait_for_selector("input[name=identifier]")
    page.fill("input[name=identifier]", "master33")
    page.fill("input[name=password]", "mot-de-passe-de-test")
    page.click("button[type=submit]")
    page.wait_for_selector(".stat")


def fill_contributor(page, first="Camille", last="Arnaud", number="33", promo="225", bucque="Tourne-Broche"):
    page.fill("input[name=first_name]", first)
    page.fill("input[name=last_name]", last)
    page.fill("input[name=bucque]", bucque)
    page.fill("input[name=promo]", promo)
    page.check(f".number-chip input[value='{number}']")


def shot(page, name, full=False):
    page.wait_for_timeout(350)
    text = page.evaluate("document.body.innerText")
    if re.search(r"\bnull\b|undefined|NaN|\[object Object\]", text):
        errors.append(f"[{name}] texte technique affiché à l'écran")
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)

def go(page, hash_, selector):
    page.evaluate(f"location.hash = '{hash_}'")
    page.wait_for_selector(selector)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # --- Ordinateur, visiteur sans compte --------------------------------------
    page = browser.new_page(viewport={"width": 1366, "height": 860})
    watch(page, "ordinateur")
    page.goto(BASE)
    page.wait_for_selector(".post")
    assert page.query_selector("input[name=password]") is None, "le site ne doit pas demander de connexion"
    shot(page, "d01-fil")

    page.click(".post:has(.post-media) .post__title a")
    page.wait_for_selector(".comments"); shot(page, "d02-article", full=True)
    page.click(".post-media__btn"); page.wait_for_selector(".lightbox[open]"); shot(page, "d03-visionneuse-article")
    page.keyboard.press("Escape")

    # Commentaire par un visiteur
    page.fill("textarea[name=body]", "Merci pour ce beau compte rendu.")
    page.fill("input[name=author_name]", "Bernard Delorme")
    page.fill("input[name=author_bucque]", "Vieux-Chêne")
    page.fill("input[name=author_promo]", "198")
    page.click(".comment-form button[type=submit]")
    page.wait_for_selector("text=Commentaire publié")
    shot(page, "d04-commentaire")

    # Dépôt d'un article : contrôles du formulaire
    go(page, "#/deposer", "input[name=first_name]")
    page.fill("input[name=title]", "Mon premier article")
    page.click("button:has-text('Déposer l’article')")
    assert page.query_selector(".field.has-error"), "l'identité devrait être obligatoire"
    shot(page, "d05-depot-identite-obligatoire")

    fill_contributor(page, promo="300")
    page.click("button:has-text('Déposer l’article')")
    assert "140 et 250" in page.inner_text(".field.has-error"), "la promotion devrait être bornée"
    page.fill("input[name=promo]", "225")
    page.click("summary:has-text('En dire un peu plus')")
    page.fill("input[name=company]", "Safran")
    page.fill("input[name=email]", "camille.arnaud@exemple.fr")
    page.check("input[name=show_contact]")
    page.fill("textarea[name=body]", "**Bonjour** à tous,\n\n- un\n- deux")
    page.click("text=Aperçu"); page.wait_for_selector(".editor__preview .post")
    shot(page, "d06-depot-apercu", full=True)
    page.click("text=Écrire")
    page.click("button:has-text('Déposer l’article')")
    page.wait_for_selector(".modal[open]")
    assert "relira" in page.inner_text(".modal[open]"), "la validation devrait être annoncée"
    shot(page, "d07-depot-confirmation")
    page.click(".modal[open] a:has-text('Voir mes contributions')")
    page.wait_for_selector(".contrib")
    shot(page, "d08-mes-contributions")

    go(page, "#/galerie", ".tile"); shot(page, "d09-galerie")
    page.click(".tile__btn"); page.wait_for_selector(".lightbox[open]"); shot(page, "d10-visionneuse")
    page.keyboard.press("ArrowRight"); page.keyboard.press("Escape")
    page.click("button:has-text('Ajouter des photos')"); page.wait_for_selector(".modal[open] input[name=first_name]")
    shot(page, "d11-depot-photos")
    page.keyboard.press("Escape")

    go(page, "#/planning", ".reglet__item"); shot(page, "d12-planning-frise", full=True)
    page.click(".agenda__row"); page.wait_for_selector(".modal[open] .event-detail"); shot(page, "d13-fiche-evenement")
    page.keyboard.press("Escape")
    page.click("button:has-text('Ajouter un événement')"); page.wait_for_selector(".modal[open] input[name=title]")
    page.fill(".modal[open] input[name=title]", "Sortie de printemps")
    page.check(".modal[open] input[value=many]")
    page.fill(".modal[open] input[name=start_date]", "2026-05-10")
    page.fill(".modal[open] input[name=end_date]", "2026-05-08")
    page.click(".modal[open] button:has-text('Ajouter l’événement')")
    assert "précéder" in page.inner_text(".modal[open]"), "contrôle de date manquant"
    shot(page, "d14-evenement-erreur")
    page.keyboard.press("Escape")
    page.click("button:has-text('Mois')"); page.wait_for_selector(".month__grid"); shot(page, "d15-planning-mois")

    go(page, "#/annuaire", ".member-card"); shot(page, "d16-annuaire")
    page.click(".member-card >> nth=0"); page.wait_for_selector(".modal[open] .member-detail")
    shot(page, "d17-fiche-contributeur")
    page.keyboard.press("Escape")
    go(page, "#/confidentialite", ".prose-section")

    # L'administration demande une connexion
    page.evaluate("location.hash = '#/admin'")
    page.wait_for_selector("input[name=password]")
    shot(page, "d18-acces-admin")
    login_admin(page); shot(page, "d19-admin-tableau")
    go(page, "#/admin/contenus?type=publications", ".table"); shot(page, "d20-admin-contenus")
    go(page, "#/admin/categories", ".crud__row"); shot(page, "d21-admin-categories", full=True)
    go(page, "#/admin/parametres", "input[name='site.name']"); shot(page, "d22-admin-parametres", full=True)
    go(page, "#/admin/journal", ".table")
    go(page, "#/admin/export", ".panel__row")

    # --- Téléphone --------------------------------------------------------------
    m = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    watch(m, "téléphone")
    m.goto(BASE); m.wait_for_selector(".post"); shot(m, "m01-fil")
    go(m, "#/deposer", "input[name=first_name]"); shot(m, "m02-depot", full=True)
    go(m, "#/galerie", ".tile"); shot(m, "m03-galerie")
    go(m, "#/planning", ".agenda__row"); shot(m, "m04-planning")
    go(m, "#/annuaire", ".member-card"); shot(m, "m05-annuaire")
    m.click(".icon-btn--light"); m.wait_for_selector(".menu--account:not([hidden])"); shot(m, "m06-menu")

    browser.close()

if errors:
    print("ERREURS :")
    for e in errors: print(" -", e)
    sys.exit(1)
print("Parcours complet : aucune erreur JavaScript.", len(list(OUT.glob('*.png'))), "captures.")
