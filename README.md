# Portfolio

Site and resumes, both built from `content/`.

## Add a project
Copy any file in `content/projects/`, change the frontmatter, write a few lines. It shows up on the site.
`bullets` are for the site; `resume_bullets` (optional, about 20 words each) are what the PDFs use.
To put it on a resume, add its file name to that resume's `projects` list in `content/resumes.yaml`.
Order matters there: a resume that runs past one page gets slightly smaller type, then loses projects from the end.

`content/MASTER.md` is generated from all of this (`npm run master`); read it, do not edit it.

## Add a note
Drop a markdown file in `content/notes/` with `title` and `date`. The Notes link appears in the nav by itself.

## Add a whole new section
Add a collection in `src/content.config.ts`, copy `src/pages/notes/` and rename, add a nav entry in `src/layouts/Base.astro`.

## Change the look
`src/styles/tokens.css`.

## Commands
    npm run dev        # site at localhost:4321
    npm run resumes    # regenerate MASTER.md and the five PDFs in public/resume/ (needs Microsoft Edge), and check they parse
    npm run build      # static site into dist/

Pushing to `main` deploys to GitHub Pages. The PDFs are committed, so CI does not need to build them.
