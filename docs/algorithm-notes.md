# Algorithm Notes

This project adapts two Advanced Algorithms coursework ideas from `Advanced-Algorithms-Programming-T27`.

## Friend Suggestions: BST + Friend-of-Friend Counts

The original `Exercise1.py` stores users in a binary search tree by numeric user id and suggests friends by counting repeated friend-of-friend appearances.

Vibe adapts that model for social music discovery:

- Users are inserted into a BST by id.
- Existing follows are treated as direct connections.
- Candidate recommendations are users followed by direct connections.
- Existing follows and the current user are excluded.
- Candidates are ranked by frequency.

Complexity is `O(F * A * H)` for `F` direct follows, average adjacency size `A`, and tree height `H`. In a balanced tree, `H = log n`; in a degenerate tree, `H = n`.

## Trending Posts: Max Heap

The original `Exercise2.py` implements a max heap keyed by likes.

Vibe adapts it for trending vibe posts:

- Each post is pushed into a heap with `post_id`, `like_count`, and timestamp.
- Like updates repair heap order with heapify-up or heapify-down.
- `top_k` returns the most liked posts while preserving the original heap.

Core operations:

- Insert: `O(log n)`
- Update likes: `O(log n)`
- Peek max: `O(1)`
- Top-k: `O(k log n)` using a temporary heap copy

## Key Technical Challenge

The main challenge is balancing demo-ready product behavior with algorithm visibility. The app uses normal social UI patterns, while the Python modules keep the algorithm implementations inspectable and testable for the Advanced Algorithms requirement.
