from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


@dataclass
class BSTNode:
    user_id: int
    username: str
    friends: List[int] = field(default_factory=list)
    left: Optional["BSTNode"] = None
    right: Optional["BSTNode"] = None


class UserBST:
    """BST-backed user directory adapted from the course Exercise 1."""

    def __init__(self) -> None:
        self.root: Optional[BSTNode] = None

    def insert(self, user_id: int, username: str, friends: Sequence[int]) -> None:
        self.root = self._insert(self.root, user_id, username, list(friends))

    def _insert(
        self,
        node: Optional[BSTNode],
        user_id: int,
        username: str,
        friends: List[int],
    ) -> BSTNode:
        if node is None:
            return BSTNode(user_id=user_id, username=username, friends=friends)
        if user_id < node.user_id:
            node.left = self._insert(node.left, user_id, username, friends)
        elif user_id > node.user_id:
            node.right = self._insert(node.right, user_id, username, friends)
        else:
            node.username = username
            node.friends = friends
        return node

    def find(self, user_id: int) -> Optional[BSTNode]:
        return self._find(self.root, user_id)

    def _find(self, node: Optional[BSTNode], user_id: int) -> Optional[BSTNode]:
        if node is None:
            return None
        if user_id == node.user_id:
            return node
        if user_id < node.user_id:
            return self._find(node.left, user_id)
        return self._find(node.right, user_id)

    def inorder_ids(self) -> List[int]:
        result: List[int] = []
        self._inorder(self.root, result)
        return result

    def _inorder(self, node: Optional[BSTNode], result: List[int]) -> None:
        if node is None:
            return
        self._inorder(node.left, result)
        result.append(node.user_id)
        self._inorder(node.right, result)

    def suggest_friends(self, user_id: int, limit: int = 5) -> List[Tuple[int, int]]:
        user = self.find(user_id)
        if user is None:
            return []

        direct = set(user.friends)
        counts: Dict[int, int] = {}

        for friend_id in user.friends:
            friend = self.find(friend_id)
            if friend is None:
                continue
            for candidate_id in friend.friends:
                if candidate_id == user_id or candidate_id in direct:
                    continue
                counts[candidate_id] = counts.get(candidate_id, 0) + 1

        ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return ranked[:limit]


def suggest_from_edges(
    users: Iterable[Tuple[int, str]],
    follows: Iterable[Tuple[int, int]],
    user_id: int,
    limit: int = 5,
) -> List[Tuple[int, int]]:
    adjacency: Dict[int, List[int]] = {}
    names: Dict[int, str] = {}

    for uid, username in users:
        names[uid] = username
        adjacency.setdefault(uid, [])

    for follower_id, following_id in follows:
        adjacency.setdefault(follower_id, []).append(following_id)

    tree = UserBST()
    for uid in sorted(names):
        tree.insert(uid, names[uid], sorted(adjacency.get(uid, [])))

    return tree.suggest_friends(user_id, limit)
