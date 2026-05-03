from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple


@dataclass
class HeapEntry:
    post_id: int
    likes: int
    timestamp: float

    def as_dict(self) -> dict:
        return {
            "post_id": self.post_id,
            "likes": self.likes,
            "timestamp": self.timestamp,
        }


class TrendingHeap:
    """Max heap adapted from the course Exercise 2."""

    def __init__(self) -> None:
        self.heap: List[HeapEntry] = []
        self.position: Dict[int, int] = {}

    def push(self, post_id: int, likes: int, timestamp: float) -> None:
        if post_id in self.position:
            self.update_likes(post_id, likes, timestamp)
            return
        self.heap.append(HeapEntry(post_id=post_id, likes=likes, timestamp=timestamp))
        self.position[post_id] = len(self.heap) - 1
        self._heapify_up(len(self.heap) - 1)

    def peek_max(self) -> dict | None:
        if not self.heap:
            return None
        return self.heap[0].as_dict()

    def pop_max(self) -> dict | None:
        if not self.heap:
            return None
        self._swap(0, len(self.heap) - 1)
        item = self.heap.pop()
        del self.position[item.post_id]
        if self.heap:
            self._heapify_down(0)
        return item.as_dict()

    def update_likes(self, post_id: int, likes: int, timestamp: float) -> None:
        if post_id not in self.position:
            self.push(post_id, likes, timestamp)
            return
        index = self.position[post_id]
        old_likes = self.heap[index].likes
        self.heap[index].likes = likes
        self.heap[index].timestamp = timestamp
        if likes > old_likes:
            self._heapify_up(index)
        else:
            self._heapify_down(index)

    def top_k(self, k: int) -> List[dict]:
        copy = TrendingHeap()
        copy.heap = [HeapEntry(item.post_id, item.likes, item.timestamp) for item in self.heap]
        copy.position = dict(self.position)
        result: List[dict] = []
        while len(result) < k and copy.heap:
            item = copy.pop_max()
            if item is not None:
                result.append(item)
        return result

    def is_valid_heap(self) -> bool:
        for index in range(1, len(self.heap)):
            parent = (index - 1) // 2
            if self.heap[index].likes > self.heap[parent].likes:
                return False
        return True

    def _swap(self, left: int, right: int) -> None:
        self.position[self.heap[left].post_id] = right
        self.position[self.heap[right].post_id] = left
        self.heap[left], self.heap[right] = self.heap[right], self.heap[left]

    def _heapify_up(self, index: int) -> None:
        while index > 0:
            parent = (index - 1) // 2
            if self.heap[index].likes <= self.heap[parent].likes:
                return
            self._swap(index, parent)
            index = parent

    def _heapify_down(self, index: int) -> None:
        size = len(self.heap)
        while True:
            largest = index
            left = index * 2 + 1
            right = index * 2 + 2

            if left < size and self.heap[left].likes > self.heap[largest].likes:
                largest = left
            if right < size and self.heap[right].likes > self.heap[largest].likes:
                largest = right
            if largest == index:
                return
            self._swap(index, largest)
            index = largest


def rank_posts(posts: Iterable[Tuple[int, int, float]], limit: int = 5) -> List[dict]:
    heap = TrendingHeap()
    for post_id, likes, timestamp in posts:
        heap.push(post_id, likes, timestamp)
    return heap.top_k(limit)
