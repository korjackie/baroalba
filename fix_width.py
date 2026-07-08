import codecs

with codecs.open('assets/css/style.css', 'r', 'utf-8') as f:
    css = f.read()

# Fix the width discrepancy by removing the margin from the mannam-banner class, since its parent already has padding
css = css.replace('.mannam-banner { margin: 12px;', '.mannam-banner { margin: 0px 0px 12px 0px;')

with codecs.open('assets/css/style.css', 'w', 'utf-8') as f:
    f.write(css)

print("Width fixed")
