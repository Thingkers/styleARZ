-- StyleARZ MySQL schema
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(64) NOT NULL PRIMARY KEY,
  meta_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'customer',
  doc JSON NOT NULL,
  created_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT '',
  audience VARCHAR(32) NULL,
  category VARCHAR(80) NULL,
  listed TINYINT(1) NOT NULL DEFAULT 1,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 9999,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_category (category),
  KEY idx_products_audience (audience),
  KEY idx_products_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  sku VARCHAR(80) NOT NULL,
  barcode VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  category VARCHAR(80) NULL,
  audience VARCHAR(32) NULL,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  listed TINYINT(1) NOT NULL DEFAULT 1,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 9999,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inventory_sku (sku),
  UNIQUE KEY uq_inventory_barcode (barcode),
  KEY idx_inventory_category (category),
  KEY idx_inventory_stock (stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_categories (
  name VARCHAR(80) NOT NULL PRIMARY KEY,
  audiences JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_deleted (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  barcode VARCHAR(80) NULL,
  deleted_at VARCHAR(40) NOT NULL,
  doc JSON NOT NULL,
  KEY idx_inventory_deleted_barcode (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS label_drafts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  barcode VARCHAR(80) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  name VARCHAR(255) NULL,
  size VARCHAR(40) NULL,
  inventory_item_id VARCHAR(64) NULL,
  doc JSON NOT NULL,
  created_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_labels_barcode (barcode),
  KEY idx_labels_status (status),
  KEY idx_labels_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  doc JSON NOT NULL,
  created_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_orders_user (user_id),
  KEY idx_orders_email (email),
  KEY idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sessions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pos_sessions_code (code),
  KEY idx_pos_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_scan_events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NULL,
  doc JSON NOT NULL,
  KEY idx_pos_scans_session (session_id),
  KEY idx_pos_scans_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sales (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  session_id VARCHAR(64) NULL,
  client_sale_id VARCHAR(80) NULL,
  created_at VARCHAR(40) NULL,
  doc JSON NOT NULL,
  KEY idx_pos_sales_session (session_id),
  KEY idx_pos_sales_client (client_sale_id),
  KEY idx_pos_sales_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sales_deleted (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  client_sale_id VARCHAR(80) NULL,
  deleted_at VARCHAR(40) NULL,
  doc JSON NOT NULL,
  KEY idx_pos_sales_deleted_client (client_sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS looks (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS home_collections (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  audience VARCHAR(32) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wardrobe (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_wardrobe_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outfits (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_outfits_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planner (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  entry_date VARCHAR(20) NULL,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_planner_user (user_id),
  KEY idx_planner_date (entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  doc JSON NOT NULL,
  created_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_posts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  read_flag TINYINT(1) NOT NULL DEFAULT 0,
  doc JSON NOT NULL,
  created_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_notifications_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offer_campaigns (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  claimed_count INT NOT NULL DEFAULT 0,
  doc JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offer_customers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  campaign_id VARCHAR(64) NOT NULL,
  slot INT NOT NULL DEFAULT 0,
  doc JSON NOT NULL,
  created_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_offer_customers_phone_campaign (phone, campaign_id),
  KEY idx_offer_customers_campaign (campaign_id),
  KEY idx_offer_customers_slot (slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
