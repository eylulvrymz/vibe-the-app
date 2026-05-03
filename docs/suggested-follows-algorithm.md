# Suggested Follows Algorithm

## What It Does

The suggested follows algorithm recommends people a user may want to follow based on friend-of-friend overlap.

In Vibe, a direct follow is treated like a social connection. If Luna follows Mika and Nova, and both Mika and Nova follow Kai, then Kai becomes a strong suggestion for Luna because Kai appears more than once through Luna's existing network.

## Data Structures

The algorithm uses two main structures:

1. A Binary Search Tree (BST) of users, ordered by numeric user id.
2. A frequency map for candidate recommendations.

The BST comes from the Advanced Algorithms coursework idea in `Exercise1.py`. It lets us insert users, find a user by id, and look up each direct follow's own follow list.

## Step-by-Step Logic

1. Find the target user in the BST.
2. Put the target user's direct follows into a set.
3. For every direct follow:
   - Find that followed user in the BST.
   - Read that user's own follows.
   - Each followed-by-a-followed-user account becomes a candidate.
4. Exclude:
   - the target user themself
   - users already directly followed by the target user
5. Count how many times each candidate appears.
6. Sort candidates by frequency from highest to lowest.
7. Return the top results.

## Example

Current follow graph:

```text
Luna -> Mika
Luna -> Nova
Mika -> Kai
Mika -> Iris
Nova -> Kai
```

For Luna:

```text
Direct follows: Mika, Nova
Candidates from Mika: Kai, Iris
Candidates from Nova: Kai
Counts:
  Kai = 2
  Iris = 1
```

Result:

```text
1. Kai
2. Iris
```

Kai ranks first because two different people Luna follows also follow Kai.

## Complexity

Let:

- `n` be the number of users.
- `F` be the number of people the target user follows.
- `A` be the average number of follows each followed user has.
- `h` be the height of the BST.

Finding a user in the BST costs:

```text
O(h)
```

In a balanced BST:

```text
h = O(log n)
```

In the worst case, if the tree becomes a chain:

```text
h = O(n)
```

The recommendation scan checks the target user's follows and their follow lists:

```text
O(F * h + F * A)
```

The final sorting step depends on the number of candidate users `C`:

```text
O(C log C)
```

So the overall practical complexity is:

```text
O(F * h + F * A + C log C)
```

## Why This Fits Vibe

This algorithm works well for a music-based social app because music taste is social. If several people you already follow all follow the same listener, that listener is probably close to your taste community.

The recommendation is explainable:

```text
"Suggested because multiple people you follow also follow this user."
```

That makes it easy to present, easy to debug, and clearly connected to the Advanced Algorithms course.

## Presenter Script

"For suggested follows, we adapted our coursework Binary Search Tree user system. Each user is stored in the BST by id, and each user has a list of follows. When Vibe recommends new people, it first finds the current user, then looks at the people they already follow. It then checks who those people follow. Candidates who appear multiple times are ranked higher because they are connected through more than one existing follow. We exclude the current user and accounts already followed. This gives us an explainable friend-of-friend recommendation algorithm using a BST plus a frequency map."
