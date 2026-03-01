# Duplicate Message Guard Design

**Goal:** Prevent the same conversational message from being applied twice on the same session within a short window.

## Problem

If the same order message reaches the backend twice for the same `chatId`, the assistant currently merges the same items again and doubles the accumulated total. The visible symptom is a correct line-item list with an inflated `Total parcial`.

## Chosen Approach

Store lightweight idempotency metadata in the persisted checkpoint:

- normalized last handled message
- timestamp of the last handled message
- last response text

On a new request:

- normalize the incoming text
- if it matches the last handled message
- and it arrives within a short window (10 seconds)
- treat it as a duplicate

For duplicates:

- do not run extraction or merge logic again
- return the previous response text
- keep the original dedupe timestamp so the window does not extend forever

## Scope

This is session-scoped and message-scoped:

- same `chatId`
- same normalized message
- only within the dedupe window

It is intentionally simple and deterministic.
