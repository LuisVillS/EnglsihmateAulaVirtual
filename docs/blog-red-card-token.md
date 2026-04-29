# Blog Red Card Token

The admin editor uses the canonical token `[red card]` to place the frontend Red Card component inside article content.

## Contract

- Admin inserts exactly `[red card]`.
- The token is stored inline in `blog_posts.content_markdown`.
- The public frontend renderer is responsible for replacing the token with the existing Red Card component.
- Admin does not render or redesign the Red Card component.

## Editor Behavior

The `Insertar Red Card` toolbar button inserts `[red card]` at the current article-body cursor position. Editors should not need to type the token manually.

The token is ignored by the admin article word-count helper so it does not inflate SEO/content quality metrics.
