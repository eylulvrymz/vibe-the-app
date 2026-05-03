from __future__ import annotations

import argparse
import json
from pathlib import Path

from .friend_suggestions import suggest_from_edges
from .trending_heap import rank_posts


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Vibe algorithm demos.")
    parser.add_argument("mode", choices=["trending", "suggestions"])
    parser.add_argument("--input", required=True, help="Path to JSON input.")
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))

    if args.mode == "trending":
        posts = [
            (int(item["post_id"]), int(item["likes"]), float(item["timestamp"]))
            for item in payload["posts"]
        ]
        print(json.dumps(rank_posts(posts, args.limit), indent=2))
        return

    users = [(int(item["id"]), item["username"]) for item in payload["users"]]
    follows = [
        (int(item["follower_id"]), int(item["following_id"]))
        for item in payload["follows"]
    ]
    print(json.dumps(suggest_from_edges(users, follows, args.user_id, args.limit), indent=2))


if __name__ == "__main__":
    main()
