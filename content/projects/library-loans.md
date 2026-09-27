---
title: Library Loans Explorer
blurb: "Flask front end over a relational library database: a member's full loan history and live copy availability by branch, on PostgreSQL or SQLite."
repo: https://github.com/happyc0der/library-loans-explorer
image: /img/library-loans.png
year: 2025
order: 24.5
featured: false
stack: [Python, Flask, PostgreSQL, SQLite, psycopg2, Jinja2, pytest]
tags: [data, swe]
stats: ["2 database backends", "parameterised SQL", "pytest on both"]
bullets:
  - "Built for NYU's Principles of Database Systems (Spring 2025): a member enters an ID and sees every loan they have made, then clicks a book to see which copies are on the shelf right now and at which branch."
  - "One codebase runs on PostgreSQL through a psycopg2 connection pool or on SQLite with no setup, chosen by one DATABASE_URL setting; one command creates the schema and loads the sample data on either."
  - "Every query is parameterised, bad input gets a 400 or 404, database errors are logged but not shown to users, and a pytest suite runs on SQLite by default and on PostgreSQL when pointed at one."
---

A small web app over a five-table library schema (members, books, branches, book copies and loans), built for Problem Set 3 of NYU Tandon's CS-GY 6083 Principles of Database Systems in Spring 2025. A loan's key is member, copy and loan date, so the same member can borrow the same copy again later, and a copy is available when it has no loan without a return date.

It was written against PostgreSQL and later made to run on SQLite as well, so it can be tried straight from a fresh clone: `flask --app app init-db` loads the sample data (5 members, 5 branches, 8 books, 36 copies, 20 loans) on either backend.
