import datetime
from string import Template
import re
import sys

import pywikibot

CAT_PEND = "Category:Pending AfC submissions"
OUTPUT_FILE = "index.html"
TEMPLATE = "template.html"
DISALLOWED_TITLES = ("Wikipedia:Articles for creation/Redirects",
        "Wikipedia:Files for upload")
ROW_FORMAT = "<tr><td><a href='https://en.wikipedia.org/wiki/{0}'>{1}</a></td><td>{2}</td><td value='{3}'>{4}</td><td id='status-{5}'>Unknown</td></tr>"
POSSIBLE_NOTES = ("copyvio", "no-inline", "unsourced", "short", "resubmit", "veryold", "userspace")
NOTE_MEANINGS = {
        "copyvio": "Submission is a suspected copyvio",
        "no-inline": "Submission lacks inline citations",
        "unsourced": "Submission lacks references completely",
        "short": "Submission is very short (less than 1 kilobyte)",
        "resubmit": "Submission was already declined",
        "veryold": "Submission is over 21 days old",
        "userspace": "Submission is in userspace"
        }
FILTER_FORMAT = "<label><input name='filter' value='{0}' type='checkbox' /> <abbr title='{1}'>{0}</abbr></label>"
PROJ_FORMAT = "<abbr class='wikiproject' title='{0}'>{1}</abbr>"
PROJ_OPTION_FORMAT = "<option value='{0}'>{0} - {1}</option>"

IBX_MAP_PAGE_TITLE = "User:Enterprisey/ibx-wproj-map.js"
REQD_EDITOR = "Enterprisey" # must be the last editor of IBX_MAP_PAGE_TITLE

# Global variable; holds lookup table from infobox names to lists of wikiproject shortcuts
ibx_wproj_map = {}

# Global variable; holds lookup table from wikiproject shortcut to wikiproject name
wproj_shortcut_to_name = {}

# Global variable; holds lookup table from *lowercased* wikiproject name to wikiproject shortcut
wproj_name_to_shortcut = {}

def print_log(what_to_print):
    print(datetime.datetime.utcnow().strftime("[%Y-%m-%dT%H:%M:%SZ] ") + what_to_print)

def make_project_tables(ibx_map_page):
    global wproj_shortcut_to_name
    global wproj_name_to_shortcut

    # Check if REQD_EDITOR was the last editor of the page
    if not ibx_map_page.userName() == REQD_EDITOR:
        print_log("Last editor was {} (expected: {}) - aborting!".format(ibx_map_page.userName(), REQD_EDITOR))
        sys.exit(1)

    # Build ibx_wproj_map
    print_log("Getting lookup table...")
    table_wikitext = ibx_map_page.get()
    ibx_text, _, wproj_text = table_wikitext.partition("--------------------")
    for each_line in ibx_text.splitlines():
        if not each_line or each_line.startswith("//"):
            continue
        tokens = each_line.split("|")
        tokens = map(lambda s: s.strip(), tokens)
        ibx_wproj_map[tokens[0].lower()] = tokens[1:]

    # Build the other two
    for each_line in wproj_text.splitlines():
        if not each_line or each_line.startswith("//"):
            continue
        tokens = each_line.split("|")
        tokens = map(lambda s: s.strip(), tokens)
        wproj_name_to_shortcut[tokens[0].lower()] = (tokens[0], tokens[1])
        wproj_shortcut_to_name[tokens[1]] = tokens[0]
    print_log("Generated lookup table.")

def wproj_to_html(wproj):
    """
    Given a WikiProject abbreviation, return a HTML string describing
    it.
    """
    return PROJ_FORMAT.format(wproj_shortcut_to_name[wproj], wproj)

def get_projects(page_obj):
    """
    Returns a HTML string that describes the WikiProjects that probably
    are associated with the given wikitext. Uses the lookup table
    prefetched by make_project_tables(). For example, if the page had
    Infobox software, we would return
    <abbr title="WikiProject Computing">comp</abbr>:

    >>> import pywikibot
    >>> wiki = pywikibot.Site("en", "wikipedia")
    >>> make_project_tables(pywikibot.Page(wiki, IBX_MAP_PAGE_TITLE))
    >>> get_projects("{{Infobox software")
    '<abbr title="WikiProject Computing">COMP</abbr>'
    """
    global ibx_wproj_map
    project_strings = []
    project_abbrevs = []

    # Get existing projects from talk page
    talk_page = page_obj.toggleTalkPage()
    if talk_page.exists() and not talk_page.isRedirectPage():
        talk_page_text = talk_page.get()
        banner_re = re.compile(r"\{\{(wikiproject\s+[\w\s]+?)(?:\}|\|)", re.I)
        for each_match in banner_re.finditer(talk_page_text):
            key = each_match.group(1).lower().strip()
            abbrevs = wproj_name_to_shortcut.get(key, None)
            if abbrevs:
                project_strings.append(PROJ_FORMAT.format(*abbrevs))
                project_abbrevs.append(abbrevs[1])
            else:
                pass #print(each_match.group(1).strip())

    # Now detect projects from infoboxes
    ibx_re = re.compile(r"\{\{\s*([Ii]nfobox\s+[\w\s]+?)(?:\n|\|)")
    wikitext = page_obj.get()
    for each_match in ibx_re.finditer(wikitext):
        key = each_match.group(1).lower().strip()
        wprojs = ibx_wproj_map.get(key, None)
        if wprojs:
            project_strings.append(", ".join(map(wproj_to_html, wprojs)))
            project_abbrevs.extend(wprojs)
    return (project_abbrevs, ", ".join(project_strings))

def get_notes(page_obj):
    """Adapted from https://github.com/earwig/earwigbot-plugins/blob/develop/tasks/afc_statistics.py#L694-L744"""
    content = page_obj.get()
    notes = []
    regex = r"\{\{s*AfC suspected copyvio"
    if re.search(regex, content):
	notes.append("copyvio")  # Submission is a suspected copyvio

    if not re.search(r"\<ref\s*(.*?)\>(.*?)\</ref\>", content, re.I|re.S):
	regex = r"(https?:)|\[//(?!{0})([^ \]\t\n\r\f\v]+?)"
	sitedomain = re.escape("en.wikipedia.org")
	if re.search(regex.format(sitedomain), content, re.I | re.S):
	    notes.append("no-inline")  # Submission has no inline citations
	else:
	    notes.append("unsourced")  # Submission is completely unsourced

    if len(content) < 1000:
	notes.append("short") # Submission is short

    if re.search(r"\{\{AfC submission\|d\|", content, re.I):
        notes.append("resubmit") # Submission was declined in the past

    if any(each_cat.title(withNamespace=False).endswith("Very old") for each_cat in page_obj.categories()):
        notes.append("veryold") # Submission is very old

    if page_obj.title().startswith("User:"):
        notes.append("userspace") # Submission is in userspace

    return notes

def main():
    print_log("Starting pending-subs updater")
    global wiki
    wiki = pywikibot.Site("en", "wikipedia")
    wiki.login()

    # Make lookup tables for wikiproject detection
    make_project_tables(pywikibot.Page(wiki, IBX_MAP_PAGE_TITLE))

    # Generate list of titles
    cat_pend = pywikibot.Category(wiki, CAT_PEND)
    titles = [] # (title, notes) e.g. ("Draft:Foo", ["copyvio"])
    i = 0

    # Stores shortcuts that have at least one draft. These are the only
    # shortcuts we show in the dropdown filter.
    shortcuts_with_drafts = set()

    for each_article in cat_pend.articles(content=True, total=None): # TODO remove total=5
        each_title = each_article.title(withNamespace=True).encode("utf-8")
        if (each_title not in DISALLOWED_TITLES and
                not each_article.isRedirectPage()):
            notes = get_notes(each_article)
            proj_shortcuts, proj_html = get_projects(each_article)

            # Update the list of shortcuts we've seen
            shortcuts_with_drafts.update(proj_shortcuts)

            # We receive proj_shortcuts in list form, so make it a string
            proj_shortcuts = ",".join(proj_shortcuts)

            titles.append((each_title, notes, proj_shortcuts, proj_html))
        i += 1
        if i % 100 == 0:
            print_log("{} drafts processed...".format(i))

    # Write titles into template
    with open(TEMPLATE) as template_file:
        with open(OUTPUT_FILE, "w") as output_file:
            template = Template("\n".join(template_file.readlines()))
            metadata = datetime.datetime.utcnow().strftime("Generated at %H:%M, %d %B %Y (UTC).")
            filters = "\n".join(FILTER_FORMAT.format(note, meaning) for note, meaning in NOTE_MEANINGS.items())
            html_id = lambda title: title.replace(" ", "-").replace("'", "-").replace("+", "-")
            subs = "\n".join(ROW_FORMAT.format(title.replace("'", "%27"),
                    title, ", ".join(notes), project_shortcuts, projects, html_id(title))
                    for title, notes, project_shortcuts, projects in titles)
            projs = "\n".join(PROJ_OPTION_FORMAT.format(shortcut, wproj_shortcut_to_name[shortcut])
                    for shortcut in shortcuts_with_drafts)
            output_file.write(template.substitute({
                "metadata": metadata,
                "filters": filters,
                "subs": subs,
                "projs": projs,
                "draftcount": str(len(titles))
                }))

if __name__ == "__main__":
    #import doctest
    #doctest.testmod()
    main()
