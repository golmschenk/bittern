import datetime

project = 'RGES-PIT Pipeline Tools'
now_year = datetime.datetime.now().year
project_start_year = 2025
author = 'Greg Olmschenk'

html_title = "RGES-PIT Pipeline Tools"
project_copyright = (f'{f"{project_start_year} - " if project_start_year != now_year else ""}{now_year}, '
                     f'{author}')


extensions = [
    "myst_parser",
    "sphinx.ext.autodoc",
    'sphinx_copybutton',
]

templates_path = ["_templates"]
exclude_patterns = []
source_suffix = [".rst", ".md"]

html_theme = 'furo'
html_static_path = ['_static']
