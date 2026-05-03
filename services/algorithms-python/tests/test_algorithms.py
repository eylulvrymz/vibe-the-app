import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vibe_algorithms.friend_suggestions import UserBST, suggest_from_edges
from vibe_algorithms.trending_heap import TrendingHeap, rank_posts


class FriendSuggestionTests(unittest.TestCase):
    def test_bst_inorder_and_lookup(self):
        tree = UserBST()
        tree.insert(3, "nova", [1])
        tree.insert(1, "luna", [2, 3])
        tree.insert(2, "mika", [3])

        self.assertEqual(tree.inorder_ids(), [1, 2, 3])
        self.assertEqual(tree.find(2).username, "mika")
        self.assertIsNone(tree.find(99))

    def test_friend_of_friend_suggestions_exclude_existing_follows(self):
        users = [(1, "luna"), (2, "mika"), (3, "nova"), (4, "kai"), (5, "iris")]
        follows = [(1, 2), (1, 3), (2, 4), (2, 5), (3, 4)]

        self.assertEqual(suggest_from_edges(users, follows, user_id=1), [(4, 2), (5, 1)])


class TrendingHeapTests(unittest.TestCase):
    def test_top_k_preserves_heap(self):
        heap = TrendingHeap()
        heap.push(1, 12, 1.0)
        heap.push(2, 40, 2.0)
        heap.push(3, 30, 3.0)

        self.assertEqual([item["post_id"] for item in heap.top_k(2)], [2, 3])
        self.assertTrue(heap.is_valid_heap())
        self.assertEqual(heap.peek_max()["post_id"], 2)

    def test_like_updates_repair_heap(self):
        heap = TrendingHeap()
        heap.push(1, 12, 1.0)
        heap.push(2, 40, 2.0)
        heap.update_likes(1, 80, 3.0)

        self.assertEqual(heap.peek_max()["post_id"], 1)
        self.assertTrue(heap.is_valid_heap())

    def test_rank_posts(self):
        ranked = rank_posts([(10, 4, 1.0), (11, 99, 2.0), (12, 44, 3.0)], limit=2)
        self.assertEqual([item["post_id"] for item in ranked], [11, 12])


if __name__ == "__main__":
    unittest.main()
