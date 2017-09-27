import datetime
from string import Template
import re

import pywikibot

CAT_PEND = "Category:Pending AfC submissions"
OUTPUT_FILE = "index.html"
TEMPLATE = "template.html"
DISALLOWED_TITLES = ("Wikipedia:Articles for creation/Redirects",
        "Wikipedia:Files for upload")
ROW_FORMAT = "<tr><td><a href='https://en.wikipedia.org/wiki/{0}'>{1}</a></td><td>{2}</td><td id='status-{3}'>Unknown</td></tr>"
POSSIBLE_NOTES = ("copyvio", "no-inline", "unsourced", "short", "resubmit")
FILTER_FORMAT = "<input id='filter-{0}' name='filter' value='{0}' type='checkbox' /><label for='filter-{0}'>{0}</label>"

def print_log(what_to_print):
    print(datetime.datetime.utcnow().strftime("[%Y-%m-%dT%H:%M:%SZ] ") + what_to_print)

def get_notes(content):
    """Adapted from https://github.com/earwig/earwigbot-plugins/blob/develop/tasks/afc_statistics.py#L694-L744"""
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

    return notes

def main():
    print_log("Starting pending-subs updater")
    wiki = pywikibot.Site("en", "wikipedia")
    wiki.login()

    # Generate list of titles
    cat_pend = pywikibot.Category(wiki, CAT_PEND)
    titles = [] # (title, notes) e.g. ("Draft:Foo", ["copyvio"])
    for each_article in cat_pend.articles(content=True):
        each_title = each_article.title(withNamespace=True).encode("utf-8")
        if each_title not in DISALLOWED_TITLES:
            titles.append((each_title, get_notes(each_article.get())))

    # Write titles into template
    with open(TEMPLATE) as template_file:
        with open(OUTPUT_FILE, "w") as output_file:
            template = Template("\n".join(template_file.readlines()))
            asof = datetime.datetime.utcnow().strftime("Generated at %H:%M, %d %B %Y (UTC).")
            filters = "\n".join(FILTER_FORMAT.format(note) for note in POSSIBLE_NOTES)
            html_id = lambda title: title.replace(" ", "-").replace("'", "-").replace("+", "-")
            subs = "\n".join(ROW_FORMAT.format(title.replace("'", "%27"),
                    title, ", ".join(notes), html_id(title))
                    for title, notes in titles)
            output_file.write(template.substitute({"asof": asof, "filters": filters, "subs": subs}))

if __name__ == "__main__":
    main()
