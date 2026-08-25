-- Seed data for local development / demo

INSERT OR IGNORE INTO customers (id, name, email, phone, address) VALUES
  (1, 'Alice Johnson', 'alice@example.com', '555-0101', '12 Maple St, Springfield'),
  (2, 'Bob Smith', 'bob@example.com', '555-0102', '88 Oak Ave, Shelbyville'),
  (3, 'Charlie Brown', 'charlie@example.com', '555-0103', '4 River Rd, Capital City');

INSERT OR IGNORE INTO products (id, sku, name, description, price, stock_quantity, image_url, is_active) VALUES
  (1, 'SKU-0001', 'Wireless Mouse', 'Ergonomic 2.4GHz wireless mouse', 19.99, 50, 'https://picsum.photos/seed/mouse/400/300', 1),
  (2, 'SKU-0002', 'Mechanical Keyboard', 'RGB backlit mechanical keyboard', 59.99, 30, 'https://picsum.photos/seed/keyboard/400/300', 1),
  (3, 'SKU-0003', 'USB-C Hub', '7-in-1 USB-C hub with HDMI', 29.50, 40, 'https://picsum.photos/seed/hub/400/300', 1),
  (4, 'SKU-0004', 'Noise Cancelling Headphones', 'Over-ear wireless headphones', 89.00, 20, 'https://picsum.photos/seed/headphones/400/300', 1),
  (5, 'SKU-0005', '27-inch Monitor', '1440p IPS display monitor', 219.99, 15, 'https://picsum.photos/seed/monitor/400/300', 1),
  (6, 'SKU-0006', 'Webcam 1080p', 'Full HD webcam with autofocus', 34.99, 25, 'https://picsum.photos/seed/webcam/400/300', 1),
  (7, 'SKU-0007', 'Laptop Stand', 'Adjustable aluminum laptop stand', 24.99, 60, 'https://picsum.photos/seed/laptopstand/400/300', 1),
  (8, 'SKU-0008', 'Portable SSD 1TB', 'USB 3.2 external SSD', 99.99, 18, 'https://picsum.photos/seed/ssd/400/300', 1);
