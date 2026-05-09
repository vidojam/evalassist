CREATE DATABASE IF NOT EXISTS evalassist;
USE evalassist;

CREATE TABLE IF NOT EXISTS prompt_statements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_key VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL,
  statement_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category_sort (category_key, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
