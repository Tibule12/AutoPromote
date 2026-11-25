-- Original, fictional example. SQLite-compatible; adapt to the classroom DBMS.
CREATE TABLE Teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE Entries (id INTEGER PRIMARY KEY, teamId INTEGER NOT NULL REFERENCES Teams(id), score INTEGER NOT NULL);
INSERT INTO Teams VALUES (10, 'Orbit'), (20, 'Prism');
INSERT INTO Entries VALUES (101,10,60), (102,20,80), (103,10,75);
SELECT Teams.name, Entries.score FROM Entries JOIN Teams ON Teams.id = Entries.teamId WHERE Entries.score >= 70 ORDER BY Entries.score DESC;
