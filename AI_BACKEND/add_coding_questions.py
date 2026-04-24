import uuid
from pathlib import Path
from rag_retriever import load_vectordb, list_roles

def inject_coding_questions():
    print("Loading Vector DB...")
    # Load the existing database
    db = load_vectordb(Path(__file__).parent / "chroma_db")
    
    # Dynamically fetch all roles in your current DB
    roles = list_roles(db)
    if not roles:
        roles = ["Software Engineer", "Data Scientist", "AI ML Engineer"]
    
    questions = [
        {
            "text": "Write a function to solve the 'Two Sum' problem. Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
            "ideal": "The optimal solution uses a Hash Map (dictionary) to store the complement of each number as we iterate through the array. This gives O(n) Time Complexity and O(n) Space Complexity. A brute force nested loop would be O(n^2) which is suboptimal.",
            "difficulty": "Easy",
            "subtopic": "Arrays & Hashing"
        },
        {
            "text": "Write a function to check if a given string is a valid palindrome. It should ignore non-alphanumeric characters and be case-insensitive.",
            "ideal": "The optimal solution uses the Two Pointer technique. One pointer starts at the beginning, one at the end, moving inward and skipping non-alphanumeric characters. This gives O(n) Time Complexity and O(1) Space Complexity.",
            "difficulty": "Easy",
            "subtopic": "Two Pointers"
        },
        {
            "text": "Given the head of a singly linked list, reverse the list, and return the reversed list.",
            "ideal": "The optimal solution iterates through the list keeping track of 'prev', 'curr', and 'next' nodes to reverse the pointers in place. This gives O(n) Time Complexity and O(1) Space Complexity.",
            "difficulty": "Medium",
            "subtopic": "Linked Lists"
        },
        {
            "text": "Write a function to determine if a string of brackets is valid. Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
            "ideal": "The optimal solution uses a Stack. We push opening brackets onto the stack and pop them when we encounter matching closing brackets. Time Complexity is O(n) and Space Complexity is O(n).",
            "difficulty": "Easy",
            "subtopic": "Stacks"
        },
        {
            "text": "Given an array of prices where prices[i] is the price of a given stock on the ith day, write a function to calculate the maximum profit you can achieve from one buy and one sell.",
            "ideal": "The optimal solution uses a single pass. We track the minimum price seen so far and calculate the maximum profit by comparing the current price minus the minimum price. Time Complexity O(n), Space Complexity O(1).",
            "difficulty": "Easy",
            "subtopic": "Arrays & Hashing"
        },
        {
            "text": "Write a function to find the contiguous subarray (containing at least one number) which has the largest sum and return its sum. Given an integer array nums.",
            "ideal": "The optimal solution is Kadane's Algorithm. We iterate through the array, taking the maximum of the current element or the current element plus the previous subarray sum. Time Complexity O(n), Space Complexity O(1).",
            "difficulty": "Medium",
            "subtopic": "Dynamic Programming"
        },
        {
            "text": "You are climbing a staircase. It takes n steps to reach the top. Each time you can either climb 1 or 2 steps. Write a function to calculate in how many distinct ways can you climb to the top.",
            "ideal": "The optimal solution uses Dynamic Programming (bottom-up), recognizing this is a Fibonacci sequence. We only need to store the results of the last two steps. Time Complexity O(n), Space Complexity O(1).",
            "difficulty": "Easy",
            "subtopic": "Dynamic Programming"
        },
        {
            "text": "Given two strings s and t, write a function to return true if t is an anagram of s, and false otherwise.",
            "ideal": "The optimal solution counts the frequency of each character using a Hash Map or a fixed-size integer array. Then we compare the character counts. Time Complexity O(n), Space Complexity O(1) assuming the character set is limited (e.g., 26 lowercase English letters).",
            "difficulty": "Easy",
            "subtopic": "Arrays & Hashing"
        },
        {
            "text": "Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.",
            "ideal": "The optimal solution uses Binary Search. We maintain two pointers, left and right, and repeatedly halve the search space based on whether the target is smaller or larger than the midpoint. Time Complexity O(log n), Space Complexity O(1).",
            "difficulty": "Easy",
            "subtopic": "Binary Search"
        },
        {
            "text": "Given head, the head of a linked list, determine if the linked list has a cycle in it. Return true if there is a cycle, false otherwise.",
            "ideal": "The optimal solution is Floyd's Tortoise and Hare algorithm. We use a slow pointer moving one step and a fast pointer moving two steps. If they ever meet, a cycle exists. Time Complexity O(n), Space Complexity O(1).",
            "difficulty": "Easy",
            "subtopic": "Linked Lists"
        },
        {
            "text": "Given the root of a binary tree, write a function to return its maximum depth. The maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.",
            "ideal": "The optimal solution uses Recursion (DFS). We recursively find the max depth of the left and right subtrees and add 1. Time Complexity O(n), Space Complexity O(n) in the worst case due to the call stack.",
            "difficulty": "Easy",
            "subtopic": "Trees"
        },
        {
            "text": "Given the root of a binary tree, write a function to invert the tree, and return its root.",
            "ideal": "The optimal solution uses DFS to swap the left and right children of every node in the tree recursively. Time Complexity O(n), Space Complexity O(n) for the recursive call stack.",
            "difficulty": "Easy",
            "subtopic": "Trees"
        },
        {
            "text": "Write a function to merge two sorted linked lists into one sorted list. The list should be made by splicing together the nodes of the first two lists.",
            "ideal": "The optimal solution uses a dummy head node. We iterate through both lists, appending the smaller node to the new list and advancing the respective pointer. Time Complexity O(n + m), Space Complexity O(1).",
            "difficulty": "Easy",
            "subtopic": "Linked Lists"
        },
        {
            "text": "Suppose an array of length n sorted in ascending order is rotated between 1 and n times. Given the sorted rotated array nums of unique elements, return the minimum element of this array.",
            "ideal": "The optimal solution modifies Binary Search. We compare the middle element to the rightmost element to determine which half is unsorted and must contain the minimum element. Time Complexity O(log n), Space Complexity O(1).",
            "difficulty": "Medium",
            "subtopic": "Binary Search"
        },
        {
            "text": "Given an integer array nums, return an array answer such that answer[i] is equal to the product of all the elements of nums except nums[i]. You must write an algorithm that runs in O(n) time and without using the division operation.",
            "ideal": "The optimal solution uses prefix and suffix products. We can do this in two passes: first computing the prefix product array, then doing a reverse pass computing the suffix product and multiplying it directly into the result array. Time Complexity O(n), Space Complexity O(1) excluding the output array.",
            "difficulty": "Medium",
            "subtopic": "Arrays & Hashing"
        },
    ]
    
    texts = []
    metadatas = []
    
    for role in roles:
        for q in questions:
            # Format matches how your rag_retriever cleans text
            texts.append(f"question_text: {q['text']}")
            metadatas.append({
                "question_id": str(uuid.uuid4()),
                "role_tag": role,
                "difficulty_level": q['difficulty'],
                "subtopic": q['subtopic'],
                "ideal_answer": q['ideal']
            })
        
    print(f"Injecting {len(texts)} LeetCode questions across {len(roles)} roles into ChromaDB...")
    db.add_texts(texts=texts, metadatas=metadatas)
    print("✅ Successfully added! You can now start an interview for ANY role to test them out.")

if __name__ == "__main__":
    inject_coding_questions()
