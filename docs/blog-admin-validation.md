# Blog Admin Validation

The blog editor separates hard publishing blockers from editorial recommendations.

## Drafts

Draft saves are intentionally flexible. Draft posts may be incomplete while editors are working.

## Publish Blockers

Publishing is blocked when:

- blog title is missing
- slug is missing, duplicated, or not URL-safe
- slug contains underscores, spaces, uppercase-only formatting issues, or invalid characters
- article body is missing
- article body has fewer than 600 words

The database allows incomplete drafts but keeps a publish-only constraint requiring title, slug, and body content for published posts.

## Editorial Guidance

These warnings do not block publishing:

- SEO title outside 50-60 characters
- SEO description outside 120-160 characters
- blog title outside 10-70 characters
- excerpt outside 150-200 characters
- slug longer than 5 words
- slug with dates or too many filler words
- weak heading density
- very long paragraphs
- article length outside the strong long-form range

## Rule Source

Rules are centralized in `lib/blog/editor-validation.js` and used by both:

- `components/blog-post-editor.js` for live counters, warnings, and the checklist
- `app/admin/blog/actions.js` for server-side publish validation
