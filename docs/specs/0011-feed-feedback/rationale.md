# 0011 Rationale: feed feedback

## Context

The feed already ranks movies from a user's ratings, and the shared `unavailableMovies` query keeps rated and dismissed movies out of both the feed and the swipe deck. The data model spec also reserves one `feed_feedback` row per user and movie, with `not_interested` and `more_like_this` kinds. Feature 14 needs the user's feedback to persist and change later recommendations.

The choice should keep the current feed stable while a user is acting, make dismissal work on later visits and in the swipe deck, and let a positive request affect recommendation reasons without treating it as a rating.

## Options considered

### Persist both kinds of feedback and use them in the existing recommendation paths

Store one feedback kind per user and movie. Apply `not_interested` through the shared exclusion query and read a bounded set of `more_like_this` movies as recommendation anchors. This is the selected option.

### Persist dismissal only

This would keep unwanted movies out of later feeds and the deck, with a smaller change to ranking. It would leave the request for more similar movies without an effect, so it would not meet the feature's stated goal.

### Keep feedback in the browser

Local state could hide a card immediately, but it would not carry across visits or affect the server side recommender and swipe deck. It would also make the user's feedback unavailable to export and account deletion.

### Convert a positive request into a rating

This would reuse the rating anchors, but it would record a preference as if the user had rated a movie. Ratings have a separate meaning and are explicitly sourced as swipe, import, or manual in the data model. Keeping feedback separate preserves that distinction.

## Rationale

The selected option gives both actions durable meaning using the table the data model already reserves. Dismissal joins the shared exclusion rule, so the feed, later pages, and swipe deck agree. Positive feedback contributes a capped set of anchors to the recommender, while its own reason names the movie the user chose. It leaves ratings intact and avoids a new service or a second recommendation pipeline.

The main cost is added query and state complexity in the recommender and interactive feed. A cap on positive anchors bounds that work. Waiting for each save avoids reconciling optimistic state after a failure, and keeping the current feed order avoids surprising movement while the user acts.

## References

- [0002 Data model](../0002-data-model/index.md), which defines the feedback table, row key, shared exclusion behavior, export, and migration ownership.
- [0007 Taste profile and recommender](../0007-taste-profile-recommender/index.md), which defines rating anchors, scoring, reasons, and recommendation limits.
- [0008 Personalized feed](../0008-personalized-feed/index.md), which defines feed batches and the Load more interaction.
- [0010 Movie detail page](../0010-movie-detail-page/index.md), which defines the kept feed behavior that feedback updates must preserve.
