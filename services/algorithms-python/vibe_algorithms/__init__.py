"""Algorithm utilities for Vibe.

These modules adapt coursework data structures for the music social app:

- Friend suggestions use a BST-backed user directory.
- Trending posts use a max heap keyed by like count.
"""

from .friend_suggestions import UserBST, suggest_from_edges
from .trending_heap import TrendingHeap, rank_posts

__all__ = ["UserBST", "TrendingHeap", "rank_posts", "suggest_from_edges"]
