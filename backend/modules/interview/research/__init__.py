"""Question research (Slice 3c): find real interview questions for a role on the web and keep them, with their sources.

Layers, each with one job: `buckets` (what a role is looked up as), `tools` (what the model may call), `distill`
(turn untrusted text into question rows), `store` (the shared table), `ledger` and `quota` (spend limits),
`banks` (the editable per-role list), `run` (the job that ties them together), `routes` (the HTTP surface).
"""
