-- Sequence for O(1) allocation of 8-digit numeric player unique codes (stored in User.username).
CREATE SEQUENCE IF NOT EXISTS player_unique_code_seq
  START WITH 10000000
  INCREMENT BY 1
  MINVALUE 10000000
  MAXVALUE 99999999
  NO CYCLE;
