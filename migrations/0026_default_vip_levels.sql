-- Editable default spending levels; no customer balance or order history is altered.
INSERT INTO membership_levels(name,threshold_usd,discount_pct,icon,color,enabled,sort,created_at,updated_at)
SELECT 'Bronze',0,0,'🥉','#a97142',1,0,unixepoch(),unixepoch() WHERE NOT EXISTS(SELECT 1 FROM membership_levels WHERE name='Bronze');
INSERT INTO membership_levels(name,threshold_usd,discount_pct,icon,color,enabled,sort,created_at,updated_at)
SELECT 'Silver',5,5,'🥈','#9aa6b2',1,1,unixepoch(),unixepoch() WHERE NOT EXISTS(SELECT 1 FROM membership_levels WHERE name='Silver');
INSERT INTO membership_levels(name,threshold_usd,discount_pct,icon,color,enabled,sort,created_at,updated_at)
SELECT 'Gold',25,10,'🥇','#d6a438',1,2,unixepoch(),unixepoch() WHERE NOT EXISTS(SELECT 1 FROM membership_levels WHERE name='Gold');
INSERT INTO membership_levels(name,threshold_usd,discount_pct,icon,color,enabled,sort,created_at,updated_at)
SELECT 'Platinum',100,15,'💎','#64b5d4',1,3,unixepoch(),unixepoch() WHERE NOT EXISTS(SELECT 1 FROM membership_levels WHERE name='Platinum');
INSERT INTO membership_levels(name,threshold_usd,discount_pct,icon,color,enabled,sort,created_at,updated_at)
SELECT 'Diamond',250,20,'💠','#7b91e8',1,4,unixepoch(),unixepoch() WHERE NOT EXISTS(SELECT 1 FROM membership_levels WHERE name='Diamond');
