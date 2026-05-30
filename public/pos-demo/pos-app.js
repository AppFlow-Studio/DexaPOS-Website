/* ═══════════════════════════════════════════════════════════════════
   DEXA POS — Live working application
   ═══════════════════════════════════════════════════════════════════ */

/* ─── DATA ────────────────────────────────────────────────────────── */

const MENU_CATEGORIES = [
  { id: 'sandwiches', name: 'Signature Sandwiches' },
  { id: 'burgers', name: 'Burgers' },
  { id: 'sides', name: 'Sides' },
  { id: 'salads', name: 'Salads' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'shakes', name: 'Strawberry Cups' },
  { id: 'hot', name: 'Hot Drinks' },
  { id: 'iced', name: 'Iced' },
  { id: 'desserts', name: 'Desserts' }
];

const MENU_ITEMS = [
  // Sandwiches - 8 unique photos
  { id: 'M001', cat: 'sandwiches', name: 'Cheesesteak Sandwich', price: 16.99, cash: 16.34, img: 'https://images.pexels.com/photos/2983099/pexels-photo-2983099.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M002', cat: 'sandwiches', name: 'Chicken Tenders', price: 11.89, cash: 11.43, img: 'https://images.pexels.com/photos/1059943/pexels-photo-1059943.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M003', cat: 'sandwiches', name: 'Crispy Chicken Sandwich', price: 10.49, cash: 10.07, img: 'https://images.pexels.com/photos/6612776/pexels-photo-6612776.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M004', cat: 'sandwiches', name: 'Loaded Fries', price: 13.59, cash: 13.07, img: 'https://images.pexels.com/photos/8879636/pexels-photo-8879636.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M005', cat: 'sandwiches', name: 'Party Pack Tenders', price: 38.79, cash: 37.30, img: 'https://images.pexels.com/photos/5639378/pexels-photo-5639378.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M006', cat: 'sandwiches', name: 'Buffalo Chicken Wrap', price: 12.49, cash: 11.99, img: 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M007', cat: 'sandwiches', name: 'Italian Sub', price: 14.99, cash: 14.41, img: 'https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M008', cat: 'sandwiches', name: 'Turkey Club', price: 13.49, cash: 12.97, img: 'https://images.pexels.com/photos/3220617/pexels-photo-3220617.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Burgers - 5 unique photos
  { id: 'M010', cat: 'burgers', name: 'Smash Burger', price: 9.89, cash: 9.51, img: 'https://images.pexels.com/photos/19247562/pexels-photo-19247562.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M011', cat: 'burgers', name: 'Double Smash', price: 13.49, cash: 12.97, img: 'https://images.pexels.com/photos/10922931/pexels-photo-10922931.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M012', cat: 'burgers', name: 'Bacon Cheeseburger', price: 14.99, cash: 14.41, img: 'https://images.pexels.com/photos/19247582/pexels-photo-19247582.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M013', cat: 'burgers', name: 'Mushroom Swiss', price: 13.99, cash: 13.45, img: 'https://images.pexels.com/photos/17325900/pexels-photo-17325900.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M014', cat: 'burgers', name: 'Veggie Burger', price: 11.49, cash: 11.04, img: 'https://images.pexels.com/photos/13573666/pexels-photo-13573666.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'low' },

  // Sides - 6 unique photos
  { id: 'M020', cat: 'sides', name: 'French Fries', price: 4.99, cash: 4.79, img: 'https://images.pexels.com/photos/4109234/pexels-photo-4109234.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M021', cat: 'sides', name: 'Onion Rings', price: 5.49, cash: 5.28, img: 'https://images.pexels.com/photos/1109195/pexels-photo-1109195.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M022', cat: 'sides', name: 'Mozzarella Sticks', price: 6.99, cash: 6.72, img: 'https://images.pexels.com/photos/9650081/pexels-photo-9650081.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M023', cat: 'sides', name: 'Jalapeño Poppers', price: 6.49, cash: 6.24, img: 'https://images.pexels.com/photos/33649030/pexels-photo-33649030.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M024', cat: 'sides', name: 'Sweet Potato Fries', price: 5.49, cash: 5.28, img: 'https://images.pexels.com/photos/15234683/pexels-photo-15234683.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M025', cat: 'sides', name: 'Side Salad', price: 4.49, cash: 4.31, img: 'https://images.pexels.com/photos/2962450/pexels-photo-2962450.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Salads - 4 unique photos
  { id: 'M030', cat: 'salads', name: 'Caesar Salad', price: 9.99, cash: 9.61, img: 'https://images.pexels.com/photos/8251537/pexels-photo-8251537.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M031', cat: 'salads', name: 'Garden Salad', price: 8.49, cash: 8.16, img: 'https://images.pexels.com/photos/7245482/pexels-photo-7245482.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M032', cat: 'salads', name: 'Cobb Salad', price: 11.99, cash: 11.53, img: 'https://images.pexels.com/photos/6763224/pexels-photo-6763224.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M033', cat: 'salads', name: 'Greek Salad', price: 10.49, cash: 10.07, img: 'https://images.pexels.com/photos/434258/pexels-photo-434258.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Drinks - 5 unique photos
  { id: 'M040', cat: 'drinks', name: 'Fountain Soda', price: 2.99, cash: 2.87, img: 'https://images.pexels.com/photos/8042740/pexels-photo-8042740.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M041', cat: 'drinks', name: 'Bottled Water', price: 2.49, cash: 2.39, img: 'https://images.pexels.com/photos/113734/pexels-photo-113734.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M042', cat: 'drinks', name: 'Lemonade', price: 3.49, cash: 3.35, img: 'https://images.pexels.com/photos/5668200/pexels-photo-5668200.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M043', cat: 'drinks', name: 'Iced Tea', price: 2.99, cash: 2.87, img: 'https://images.pexels.com/photos/8619612/pexels-photo-8619612.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M044', cat: 'drinks', name: 'Sparkling Water', price: 3.49, cash: 3.35, img: 'https://images.pexels.com/photos/2101147/pexels-photo-2101147.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Strawberry Cups (shakes) - 4 unique photos
  { id: 'M050', cat: 'shakes', name: 'White Choc Strawberry', price: 8.99, cash: 8.65, img: 'https://images.pexels.com/photos/10066814/pexels-photo-10066814.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M051', cat: 'shakes', name: 'Milk Choc Strawberry', price: 8.99, cash: 8.65, img: 'https://images.pexels.com/photos/11381485/pexels-photo-11381485.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M052', cat: 'shakes', name: 'Dark Choc Strawberry', price: 9.49, cash: 9.13, img: 'https://images.pexels.com/photos/5464634/pexels-photo-5464634.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M053', cat: 'shakes', name: 'Cookies & Cream', price: 9.49, cash: 9.13, img: 'https://images.pexels.com/photos/7538380/pexels-photo-7538380.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Hot Drinks - 5 unique photos
  { id: 'M060', cat: 'hot', name: 'Hot Chai Latte', price: 5.99, cash: 5.76, img: 'https://images.pexels.com/photos/3551717/pexels-photo-3551717.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M061', cat: 'hot', name: 'Cappuccino', price: 4.99, cash: 4.79, img: 'https://images.pexels.com/photos/302896/pexels-photo-302896.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M062', cat: 'hot', name: 'Espresso', price: 3.49, cash: 3.35, img: 'https://images.pexels.com/photos/324028/pexels-photo-324028.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M063', cat: 'hot', name: 'Hot Chocolate', price: 4.49, cash: 4.31, img: 'https://images.pexels.com/photos/186860/pexels-photo-186860.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M064', cat: 'hot', name: 'Latte', price: 4.99, cash: 4.79, img: 'https://images.pexels.com/photos/851555/pexels-photo-851555.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Iced - 5 unique photos
  { id: 'M070', cat: 'iced', name: 'Iced Vanilla Latte', price: 5.49, cash: 5.28, img: 'https://images.pexels.com/photos/18281881/pexels-photo-18281881.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M071', cat: 'iced', name: 'Vanilla Milkshake', price: 6.99, cash: 6.72, img: 'https://images.pexels.com/photos/30494461/pexels-photo-30494461.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M072', cat: 'iced', name: 'Iced Caramel Macchiato', price: 5.99, cash: 5.76, img: 'https://images.pexels.com/photos/5305639/pexels-photo-5305639.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M073', cat: 'iced', name: 'Iced Matcha Latte', price: 5.99, cash: 5.76, img: 'https://images.pexels.com/photos/32599371/pexels-photo-32599371.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'low' },
  { id: 'M074', cat: 'iced', name: 'Iced Americano', price: 4.49, cash: 4.31, img: 'https://images.pexels.com/photos/32972501/pexels-photo-32972501.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },

  // Desserts - 3 unique photos
  { id: 'M080', cat: 'desserts', name: 'Tiramisu', price: 7.99, cash: 7.69, img: 'https://images.pexels.com/photos/754954/pexels-photo-754954.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M081', cat: 'desserts', name: 'Cheesecake Slice', price: 6.99, cash: 6.72, img: 'https://images.pexels.com/photos/20586637/pexels-photo-20586637.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' },
  { id: 'M082', cat: 'desserts', name: 'Brownie Sundae', price: 7.49, cash: 7.20, img: 'https://images.pexels.com/photos/459265/pexels-photo-459265.jpeg?auto=compress&cs=tinysrgb&w=600', stock: 'good' }
];

/* Custom SVG illustration generator — guaranteed to render, looks professional */
const SVG_ICONS = {
  burger: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><ellipse cx="50" cy="30" rx="34" ry="14" fill="#E5A769"/><ellipse cx="50" cy="28" rx="32" ry="11" fill="#F4C18A"/><circle cx="38" cy="22" r="1.5" fill="#FFF8E0"/><circle cx="50" cy="20" r="1.5" fill="#FFF8E0"/><circle cx="62" cy="22" r="1.5" fill="#FFF8E0"/><circle cx="44" cy="26" r="1.5" fill="#FFF8E0"/><circle cx="56" cy="26" r="1.5" fill="#FFF8E0"/><rect x="16" y="40" width="68" height="6" rx="3" fill="#7BC44C"/><rect x="14" y="46" width="72" height="7" rx="2" fill="#FFD43B"/><path d="M14 53 Q 18 50 22 53 Q 26 50 30 53 Q 34 50 38 53 Q 42 50 46 53 Q 50 50 54 53 Q 58 50 62 53 Q 66 50 70 53 Q 74 50 78 53 Q 82 50 86 53 L 86 56 L 14 56 Z" fill="#FFA500"/><rect x="14" y="56" width="72" height="10" rx="2" fill="#7B3F00"/><ellipse cx="50" cy="72" rx="34" ry="10" fill="#D4925A"/></svg>`,
  
  sandwich: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 18 30 L 82 30 L 78 38 L 22 38 Z" fill="#F4C18A"/><path d="M 16 38 L 84 38 L 84 46 L 16 46 Z" fill="#FFF8DC"/><path d="M 14 46 L 86 46 L 86 50 L 14 50 Z" fill="#7BC44C"/><path d="M 14 50 L 86 50 L 86 56 L 14 56 Z" fill="#E63946"/><path d="M 14 56 L 86 56 L 86 60 L 14 60 Z" fill="#FFD43B"/><path d="M 14 60 L 86 60 L 86 66 L 14 66 Z" fill="#A0522D"/><path d="M 14 66 L 86 66 L 86 70 L 14 70 Z" fill="#FFF8DC"/><path d="M 18 70 L 82 70 L 78 78 L 22 78 Z" fill="#F4C18A"/></svg>`,
  
  fries: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 26 60 L 74 60 L 70 88 L 30 88 Z" fill="#E63946"/><path d="M 28 60 L 72 60 L 70 65 L 30 65 Z" fill="#C82F3D"/><rect x="34" y="20" width="6" height="50" rx="2" fill="#FFD43B"/><rect x="42" y="14" width="6" height="56" rx="2" fill="#FFC107"/><rect x="50" y="18" width="6" height="52" rx="2" fill="#FFD43B"/><rect x="58" y="22" width="6" height="48" rx="2" fill="#FFC107"/><rect x="66" y="28" width="6" height="42" rx="2" fill="#FFD43B"/></svg>`,
  
  salad: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><ellipse cx="50" cy="68" rx="38" ry="10" fill="#FFFFFF"/><ellipse cx="50" cy="65" rx="38" ry="10" fill="#F0F0F0"/><circle cx="35" cy="55" r="14" fill="#7BC44C"/><circle cx="50" cy="50" r="16" fill="#5DAA3A"/><circle cx="65" cy="55" r="13" fill="#7BC44C"/><circle cx="42" cy="58" r="10" fill="#9DD66B"/><circle cx="58" cy="60" r="9" fill="#9DD66B"/><circle cx="40" cy="48" r="3" fill="#E63946"/><circle cx="60" cy="48" r="3" fill="#E63946"/><circle cx="50" cy="58" r="3" fill="#E63946"/><circle cx="35" cy="62" r="2" fill="#FF8C00"/><circle cx="65" cy="62" r="2" fill="#FF8C00"/></svg>`,
  
  drink: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 30 22 L 70 22 L 66 88 L 34 88 Z" fill="#E63946"/><path d="M 32 22 L 68 22 L 67 28 L 33 28 Z" fill="#FFFFFF"/><rect x="34" y="30" width="32" height="44" fill="#8B0000"/><rect x="50" y="14" width="2" height="20" fill="#FFFFFF"/><circle cx="51" cy="14" r="3" fill="#FFFFFF"/></svg>`,
  
  water: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 38 18 L 62 18 L 62 26 L 65 30 L 65 88 L 35 88 L 35 30 L 38 26 Z" fill="#A8DADC" opacity="0.6"/><path d="M 38 18 L 62 18 L 62 26 L 65 30 L 65 88 L 35 88 L 35 30 L 38 26 Z" fill="none" stroke="#457B9D" stroke-width="2"/><rect x="40" y="40" width="20" height="14" fill="#FFFFFF" opacity="0.5"/><rect x="40" y="40" width="20" height="14" fill="none" stroke="#457B9D" stroke-width="0.5"/></svg>`,
  
  shake: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 32 30 L 68 30 L 64 88 L 36 88 Z" fill="#FFB6C1"/><ellipse cx="50" cy="30" rx="18" ry="6" fill="#FFFFFF"/><circle cx="44" cy="24" r="4" fill="#FFFFFF"/><circle cx="50" cy="20" r="5" fill="#FFFFFF"/><circle cx="56" cy="24" r="4" fill="#FFFFFF"/><circle cx="50" cy="26" r="2" fill="#E63946"/><rect x="48" y="10" width="2" height="18" fill="#E63946"/></svg>`,
  
  coffee: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 28 36 L 72 36 L 68 80 Q 68 86 62 86 L 38 86 Q 32 86 32 80 Z" fill="#FFFFFF"/><path d="M 28 36 L 72 36 L 68 80 Q 68 86 62 86 L 38 86 Q 32 86 32 80 Z" fill="none" stroke="#6F4E37" stroke-width="2"/><ellipse cx="50" cy="40" rx="20" ry="4" fill="#6F4E37"/><ellipse cx="50" cy="38" rx="18" ry="3" fill="#A0826D"/><path d="M 72 44 Q 84 44 84 56 Q 84 68 72 68" fill="none" stroke="#6F4E37" stroke-width="3"/><path d="M 44 22 Q 46 16 50 16 Q 54 16 56 22" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><path d="M 40 26 Q 42 20 46 20" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.7"/></svg>`,
  
  iced: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 32 24 L 68 24 L 66 88 L 34 88 Z" fill="#D2691E" opacity="0.7"/><path d="M 32 24 L 68 24 L 66 88 L 34 88 Z" fill="none" stroke="#8B4513" stroke-width="1.5"/><rect x="38" y="32" width="10" height="10" rx="1" fill="#FFFFFF" opacity="0.8"/><rect x="52" y="38" width="9" height="9" rx="1" fill="#FFFFFF" opacity="0.8"/><rect x="40" y="50" width="10" height="10" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="54" y="56" width="8" height="8" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="48" y="14" width="2" height="14" fill="#E63946"/><rect x="52" y="14" width="2" height="14" fill="#FFFFFF"/></svg>`,
  
  dessert: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><rect x="20" y="74" width="60" height="14" fill="#FFFFFF"/><rect x="20" y="74" width="60" height="14" fill="none" stroke="#D4A574" stroke-width="1"/><rect x="20" y="58" width="60" height="16" fill="#F5E6D3"/><rect x="20" y="42" width="60" height="16" fill="#8B4513"/><rect x="20" y="38" width="60" height="4" fill="#FFFFFF"/><rect x="20" y="22" width="60" height="16" fill="#F5E6D3"/><circle cx="50" cy="22" r="6" fill="#E63946"/><circle cx="50" cy="22" r="5" fill="#FF6B6B"/><rect x="49" y="14" width="2" height="6" fill="#7BC44C"/></svg>`,
  
  chicken: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><ellipse cx="35" cy="55" rx="14" ry="20" fill="#D4925A"/><ellipse cx="50" cy="50" rx="16" ry="22" fill="#E5A769"/><ellipse cx="65" cy="55" rx="14" ry="20" fill="#D4925A"/><ellipse cx="35" cy="55" rx="10" ry="15" fill="#F4C18A"/><ellipse cx="50" cy="50" rx="12" ry="17" fill="#F4C18A"/><ellipse cx="65" cy="55" rx="10" ry="15" fill="#F4C18A"/><circle cx="32" cy="48" r="2" fill="#A0522D"/><circle cx="38" cy="60" r="2" fill="#A0522D"/><circle cx="48" cy="44" r="2" fill="#A0522D"/><circle cx="55" cy="56" r="2" fill="#A0522D"/><circle cx="62" cy="48" r="2" fill="#A0522D"/><circle cx="68" cy="60" r="2" fill="#A0522D"/></svg>`,
  
  wrap: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 22 32 Q 26 28 30 32 L 78 32 Q 82 28 82 36 L 78 76 Q 82 80 78 84 L 30 84 Q 26 88 22 84 L 26 76 L 26 36 Z" fill="#F4C18A"/><path d="M 26 36 L 78 36 L 78 76 L 26 76 Z" fill="#FFE4B5"/><path d="M 30 44 L 74 44 L 74 50 L 30 50 Z" fill="#7BC44C"/><path d="M 30 52 L 74 52 L 74 58 L 30 58 Z" fill="#E63946"/><path d="M 30 60 L 74 60 L 74 66 L 30 66 Z" fill="#FFD43B"/></svg>`,
  
  onion: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><circle cx="32" cy="48" r="14" fill="#F4C18A"/><circle cx="32" cy="48" r="10" fill="none" stroke="#D4925A" stroke-width="2"/><circle cx="32" cy="48" r="6" fill="none" stroke="#D4925A" stroke-width="2"/><circle cx="68" cy="48" r="14" fill="#F4C18A"/><circle cx="68" cy="48" r="10" fill="none" stroke="#D4925A" stroke-width="2"/><circle cx="68" cy="48" r="6" fill="none" stroke="#D4925A" stroke-width="2"/><circle cx="50" cy="68" r="16" fill="#F4C18A"/><circle cx="50" cy="68" r="11" fill="none" stroke="#D4925A" stroke-width="2"/><circle cx="50" cy="68" r="6" fill="none" stroke="#D4925A" stroke-width="2"/></svg>`,
  
  pepper: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 50 18 Q 48 14 46 18 L 46 24 Q 50 26 54 24 L 54 18 Q 52 14 50 18 Z" fill="#7BC44C"/><path d="M 32 30 Q 38 22 50 24 Q 62 22 68 30 Q 74 50 70 70 Q 60 86 50 86 Q 40 86 30 70 Q 26 50 32 30 Z" fill="#7BC44C"/><path d="M 36 36 Q 42 30 50 32 Q 58 30 64 36 Q 68 52 64 68 Q 56 80 50 80 Q 44 80 36 68 Q 32 52 36 36 Z" fill="#9DD66B"/><circle cx="44" cy="50" r="2" fill="#FFFFFF" opacity="0.6"/><circle cx="48" cy="60" r="2" fill="#FFFFFF" opacity="0.6"/></svg>`,
  
  cheese: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><path d="M 16 70 L 50 22 L 84 70 Z" fill="#FFD43B"/><path d="M 20 68 L 50 28 L 80 68 Z" fill="#FFC107"/><circle cx="40" cy="58" r="3" fill="#FFB300"/><circle cx="55" cy="48" r="2" fill="#FFB300"/><circle cx="60" cy="62" r="2.5" fill="#FFB300"/><circle cx="48" cy="50" r="1.5" fill="#FFB300"/><circle cx="35" cy="64" r="1.5" fill="#FFB300"/></svg>`,
  
  lemon: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:55%; height:55%;"><ellipse cx="50" cy="50" rx="32" ry="28" fill="#FFD43B"/><ellipse cx="50" cy="48" rx="28" ry="24" fill="#FFE066"/><circle cx="50" cy="50" r="20" fill="#FFF59D"/><line x1="50" y1="32" x2="50" y2="68" stroke="#FFD43B" stroke-width="1.5"/><line x1="32" y1="50" x2="68" y2="50" stroke="#FFD43B" stroke-width="1.5"/><line x1="38" y1="38" x2="62" y2="62" stroke="#FFD43B" stroke-width="1.5"/><line x1="62" y1="38" x2="38" y2="62" stroke="#FFD43B" stroke-width="1.5"/><circle cx="50" cy="50" r="3" fill="#FFD43B"/></svg>`
};

const ILLUSTRATIONS = {
  sandwiches: { bg: 'linear-gradient(135deg, #FEF3C7, #FCD34D)', svg: SVG_ICONS.sandwich },
  burgers:    { bg: 'linear-gradient(135deg, #FED7AA, #FB923C)', svg: SVG_ICONS.burger },
  sides:      { bg: 'linear-gradient(135deg, #FEF08A, #FACC15)', svg: SVG_ICONS.fries },
  salads:     { bg: 'linear-gradient(135deg, #D1FAE5, #6EE7B7)', svg: SVG_ICONS.salad },
  drinks:     { bg: 'linear-gradient(135deg, #DBEAFE, #93C5FD)', svg: SVG_ICONS.drink },
  shakes:     { bg: 'linear-gradient(135deg, #FCE7F3, #F9A8D4)', svg: SVG_ICONS.shake },
  hot:        { bg: 'linear-gradient(135deg, #FED7AA, #C2410C)', svg: SVG_ICONS.coffee },
  iced:       { bg: 'linear-gradient(135deg, #CFFAFE, #67E8F9)', svg: SVG_ICONS.iced },
  desserts:   { bg: 'linear-gradient(135deg, #F3E8FF, #C4B5FD)', svg: SVG_ICONS.dessert }
};

const ITEM_SVG = {
  'M002': SVG_ICONS.chicken, 'M005': SVG_ICONS.chicken,
  'M006': SVG_ICONS.wrap,
  'M021': SVG_ICONS.onion, 'M022': SVG_ICONS.cheese, 'M023': SVG_ICONS.pepper,
  'M042': SVG_ICONS.lemon,
  'M041': SVG_ICONS.water, 'M044': SVG_ICONS.water
};

function getItemIllustration(item) {
  const cat = ILLUSTRATIONS[item.cat] || ILLUSTRATIONS.sandwiches;
  const svg = ITEM_SVG[item.id] || cat.svg;
  return { bg: cat.bg, svg };
}

// Fictional customers — different from screenshot names
const CUSTOMERS = [
  { id: 'C001', name: 'Avery Reyes',    initials: 'AR', visits: 14, points: 2840, last: 'Today, 5:37 PM',     tier: 'gold' },
  { id: 'C002', name: 'Jordan Patel',   initials: 'JP', visits: 12, points: 2180, last: 'Today, 1:11 PM',     tier: 'gold' },
  { id: 'C003', name: 'Riley Chen',     initials: 'RC', visits: 9,  points: 1420, last: 'Yesterday, 7:18 PM', tier: 'silver' },
  { id: 'C004', name: 'Morgan Hayes',   initials: 'MH', visits: 7,  points: 980,  last: '2 days ago',         tier: 'silver' },
  { id: 'C005', name: 'Casey Walker',   initials: 'CW', visits: 6,  points: 720,  last: '3 days ago',         tier: 'bronze' },
  { id: 'C006', name: 'Taylor Brooks',  initials: 'TB', visits: 5,  points: 540,  last: '5 days ago',         tier: 'bronze' },
  { id: 'C007', name: 'Jamie Sullivan', initials: 'JS', visits: 4,  points: 380,  last: '1 week ago',         tier: 'bronze' },
  { id: 'C008', name: 'Quinn Foster',   initials: 'QF', visits: 3,  points: 240,  last: '1 week ago',         tier: 'bronze' }
];

let TABLES = [
  { num: 1, status: 'occupied', party: 4, time: 42, total: 84.20 },
  { num: 2, status: 'occupied', party: 2, time: 18, total: 32.50 },
  { num: 3, status: 'empty' },
  { num: 4, status: 'occupied', party: 6, time: 72, total: 148.90 },
  { num: 5, status: 'empty' },
  { num: 6, status: 'occupied', party: 3, time: 8, total: 22.10 },
  { num: 7, status: 'dirty' },
  { num: 8, status: 'occupied', party: 2, time: 31, total: 48.00 },
  { num: 9, status: 'empty' },
  { num: 10, status: 'occupied', party: 4, time: 22, total: 64.80 },
  { num: 11, status: 'empty' },
  { num: 12, status: 'occupied', party: 2, time: 5, total: 15.40 }
];

let INVENTORY = [
  { id: 'I001', name: 'Ribeye Steak', sku: 'RIB-08OZ', cost: 8.42, unit: 'lb', onHand: 42, max: 50, recipe: true },
  { id: 'I002', name: 'Chicken Breast', sku: 'CHK-BREAST', cost: 3.18, unit: 'lb', onHand: 68, max: 75, recipe: true },
  { id: 'I003', name: 'Brioche Buns', sku: 'BUN-BRIOCHE', cost: 0.42, unit: 'ea', onHand: 24, max: 100, recipe: true },
  { id: 'I004', name: 'Russet Potatoes', sku: 'POT-RUSSET', cost: 0.62, unit: 'lb', onHand: 87, max: 115, recipe: true },
  { id: 'I005', name: 'Provolone Cheese', sku: 'CHS-PROV', cost: 5.20, unit: 'lb', onHand: 8, max: 40, recipe: true },
  { id: 'I006', name: 'Whole Milk', sku: 'MLK-WHL', cost: 3.84, unit: 'gal', onHand: 0, max: 12, recipe: true },
  { id: 'I007', name: 'Sourdough Loaves', sku: 'BR-SOUR', cost: 3.50, unit: 'ea', onHand: 18, max: 28, recipe: true },
  { id: 'I008', name: 'Espresso Beans', sku: 'COF-ESP', cost: 14.20, unit: 'lb', onHand: 12, max: 20, recipe: true },
  { id: 'I009', name: 'Strawberries (fresh)', sku: 'FR-STR', cost: 4.20, unit: 'lb', onHand: 6, max: 22, recipe: true },
  { id: 'I010', name: 'Romaine Lettuce', sku: 'VEG-ROM', cost: 1.80, unit: 'head', onHand: 32, max: 40, recipe: true },
  { id: 'I011', name: 'Tomatoes (vine)', sku: 'VEG-TOM', cost: 2.40, unit: 'lb', onHand: 18, max: 30, recipe: true },
  { id: 'I012', name: 'Bacon (thick)', sku: 'PRK-BAC', cost: 6.80, unit: 'lb', onHand: 14, max: 20, recipe: true },
  { id: 'I013', name: 'Sliced Pickles', sku: 'CON-PCK', cost: 2.80, unit: 'jar', onHand: 9, max: 12, recipe: false },
  { id: 'I014', name: 'Ketchup (gallon)', sku: 'CON-KCH', cost: 11.40, unit: 'gal', onHand: 6, max: 8, recipe: false }
];

let PAST_ORDERS = [
  { id: '#S1-0006', time: '5:37 PM', period: 'today', mode: 'takeaway', customer: 'Riley Chen', status: 'unpaid', amount: 0.00 },
  { id: '#S1-0005', time: '5:14 PM', period: 'today', mode: 'takeaway', customer: 'Jordan Patel', status: 'pending', amount: 28.95 },
  { id: '#S1-0004', time: '4:48 PM', period: 'today', mode: 'dine-in', customer: 'Avery Reyes', status: 'paid', amount: 64.20 },
  { id: '#S1-0003', time: '3:33 PM', period: 'today', mode: 'dine-in', customer: 'Casey Walker', status: 'pending', amount: 47.64 },
  { id: '#S1-0002', time: '1:11 PM', period: 'today', mode: 'takeaway', customer: 'Morgan Hayes', status: 'pending', amount: 23.91 },
  { id: '#S1-0001', time: '1:06 PM', period: 'today', mode: 'takeaway', customer: 'Taylor Brooks', status: 'paid', amount: 36.33 },
  { id: '#Y1-0042', time: '8:18 PM', period: 'yesterday', mode: 'delivery', customer: 'Jamie Sullivan', status: 'paid', amount: 52.10 },
  { id: '#Y1-0041', time: '7:44 PM', period: 'yesterday', mode: 'dine-in', customer: 'Quinn Foster', status: 'paid', amount: 89.40 },
  { id: '#Y1-0040', time: '6:30 PM', period: 'yesterday', mode: 'takeaway', customer: 'Avery Reyes', status: 'paid', amount: 18.99 },
  { id: '#Y1-0039', time: '2:12 PM', period: 'yesterday', mode: 'takeaway', customer: 'Riley Chen', status: 'refunded', amount: 14.50 },
  { id: '#W1-0220', time: '8:42 PM', period: '7d', mode: 'dine-in', customer: 'Jordan Patel', status: 'paid', amount: 124.80 },
  { id: '#W1-0218', time: '7:15 PM', period: '7d', mode: 'takeaway', customer: 'Morgan Hayes', status: 'paid', amount: 42.30 },
  { id: '#W1-0214', time: '1:50 PM', period: '7d', mode: 'delivery', customer: 'Casey Walker', status: 'paid', amount: 38.75 }
];

let KITCHEN_TICKETS = [
  { id: '#S1-0001', time: 11.22, mode: 'TO GO', items: [{ qty: 1, name: 'Crispy Chicken Sandwich', mods: [] }] },
  { id: '#S4-0001', time: 5.48, mode: 'TO GO', items: [{ qty: 1, name: 'Crispy Chicken Sandwich', mods: ['+ Make it a meal: Jalapeño Poppers'] }] },
  { id: '#S4-0002', time: 5.35, mode: 'TO GO', items: [{ qty: 1, name: 'Crispy Chicken Sandwich', mods: [] }] },
  { id: '#S4-0003', time: 5.21, mode: 'TO GO', items: [{ qty: 1, name: 'Cheesesteak Sandwich', mods: [] }] },
  { id: '#S5-0001', time: 4.46, mode: 'TO GO', items: [
    { qty: 1, name: 'Cookies & Cream', mods: ['+ 16 oz', '× Whole Milk', '+ Extra Shot'] },
    { qty: 1, name: 'Hot Chai Latte', mods: [] },
    { qty: 1, name: 'Vanilla Milkshake', mods: ['+ Extra cream'] }
  ]},
  { id: '#S5-0002', time: 4.42, mode: 'TO GO', items: [
    { qty: 1, name: 'Cheesesteak Sandwich', mods: ['+ Fries & Soda', '+ Extra Pickles'] },
    { qty: 1, name: 'Milk Choc Strawberry', mods: [] },
    { qty: 2, name: 'White Choc Strawberry', mods: [] }
  ]},
  { id: '#S5-0003', time: 4.38, mode: 'TO GO', items: [{ qty: 2, name: 'Cheesesteak Sandwich', mods: ['+ Fries & Soda'] }] },
  { id: '#S5-0006', time: 4.28, mode: 'TO GO', items: [
    { qty: 1, name: 'Cheesesteak Sandwich', mods: ['+ Jalapeño Poppers'] },
    { qty: 1, name: 'Smash Burger', mods: ['+ 1 Patty'] }
  ]},
  { id: '#S5-0007', time: 4.25, mode: 'TO GO', items: [{ qty: 2, name: 'Crispy Chicken Sandwich', mods: ['+ Fries & Soda'] }] },
  { id: '#S5-0011', time: 4.14, mode: 'TO GO', items: [
    { qty: 2, name: 'Cheesesteak Sandwich', mods: ['+ Jalapeño Poppers', '× Fries & Soda'] },
    { qty: 1, name: 'Chicken Tenders', mods: ['+ 8 pcs'] }
  ]},
  { id: '#S5-0008', time: 2.42, mode: 'TO GO', items: [{ qty: 1, name: 'Loaded Fries', mods: ['+ Half & Half'] }] },
  { id: '#S1-0002', time: 1.58, mode: 'TO GO', items: [{ qty: 1, name: 'Cheesesteak Sandwich', mods: [] }] }
];

const STAFF = [
  { initials: 'AR', name: 'Avery Reyes', role: 'Manager', color: '#5B6CFF', shifts: ['9:00–5:00','9:00–5:00','11:00–8:00','off','11:00–9:00','10:00–9:00','off'] },
  { initials: 'JP', name: 'Jordan Patel', role: 'Server', color: '#5B6CFF', shifts: ['11:00–7:00','off','11:00–7:00','11:00–7:00','5:00–10:00','11:00–10:00','11:00–7:00'] },
  { initials: 'RC', name: 'Riley Chen', role: 'Bartender', color: '#F59E0B', shifts: ['off','3:00–11:00','3:00–11:00','3:00–11:00','3:00–12:00','3:00–12:00','off'] },
  { initials: 'MH', name: 'Morgan Hayes', role: 'Line Cook', color: '#10B981', shifts: ['10:00–7:00','10:00–7:00','off','10:00–7:00','10:00–10:00','10:00–10:00','10:00–7:00'] },
  { initials: 'CW', name: 'Casey Walker', role: 'Server', color: '#EF4444', shifts: ['11:00–7:00','11:00–7:00','11:00–7:00','off','open','5:00–10:00','5:00–10:00'] },
  { initials: 'TB', name: 'Taylor Brooks', role: 'Prep Cook', color: '#8B5CF6', shifts: ['8:00–4:00','8:00–4:00','8:00–4:00','8:00–4:00','off','open','8:00–4:00'] }
];

let CAMPAIGNS = [
  { name: 'Birthday Reward', desc: "Free dessert · Auto-triggers on member's birthday", on: true },
  { name: 'Welcome Offer', desc: '10% off first visit · Sent on signup', on: true },
  { name: 'Win-back SMS', desc: '$5 credit · Sent if no visit in 30 days', on: false },
  { name: 'Double Points Tuesdays', desc: '2× points on all orders Tuesdays', on: true }
];

const SETTINGS = {
  business: { name: 'Hudson & Vine', location: 'Station 01 · Front Counter', tz: 'Eastern Time (US & Canada)', currency: 'USD ($)' },
  ops: { cashDiscount: true, tipPrompts: true, allergenFlags: true, autoPrint: true, managerPin: true, offline: true, customerDisplay: false },
  notif: { lowStock: true, suspicious: true, dailyEmail: true },
  payments: { card: true, cash: true, mobile: true, gift: false },
  tax: { rate: 8.88 }
};

/* ─── STATE ──────────────────────────────────────────────────────── */

let state = {
  currentOrder: [],
  orderNum: 7,
  orderMode: 'takeout',
  orderCustomer: null,
  orderNote: '',
  orderDiscount: 0,
  activeMenuCat: 'sandwiches',
  menuSearch: '',
  ordersPeriod: 'today',
  ordersFilter: null,
  ordersSearch: '',
  kitchenTab: 'all',
  bumpedTickets: new Set(),
  invFilter: 'all',
  anaPeriod: '7d',
  mgmtCat: 'sandwiches',
  mgmtToggleState: {},
  settingsPane: 'general'
};

/* ─── UTILITIES ──────────────────────────────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => root.querySelectorAll(sel);
const fmt = (n) => '$' + n.toFixed(2);
const formatOrderNum = () => 'S1-' + String(state.orderNum).padStart(4, '0');
const escapeHtml = (str) => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

let toastTimer;
function toast(text, isError = false) {
  const t = $('#toast');
  $('#toastText').textContent = text;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function stockStatus(item) {
  const pct = item.onHand / item.max * 100;
  if (item.onHand <= 0) return 'out';
  if (pct < 30) return 'low';
  return 'good';
}

/* ─── SCREEN ROUTER ──────────────────────────────────────────────── */

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'home') renderHome();
  if (name === 'sales') renderMenuTabs(), renderMenuGrid(), recalcOrder();
  if (name === 'tables') renderTables();
  if (name === 'orders') renderOrders();
  if (name === 'kitchen') renderKitchen();
  if (name === 'inventory') renderInventory();
  if (name === 'analytics') renderAnalytics();
  if (name === 'menu-mgmt') renderMenuMgmt();
  if (name === 'scheduling') renderScheduling();
  if (name === 'settings') renderSettings();
  if (name === 'loyalty') renderLoyalty();
}

/* ─── MODAL ──────────────────────────────────────────────────────── */

let lastFocused = null;

function openModal(html) {
  lastFocused = document.activeElement;
  $('#modalContent').innerHTML = html;
  $('#modal').classList.add('show');
  setTimeout(() => {
    const f = $('#modalContent input, #modalContent textarea, #modalContent .btn-primary');
    if (f) f.focus();
  }, 50);
}
function closeModal() {
  $('#modal').classList.remove('show');
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
window.closeModal = closeModal;

$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#modal').classList.contains('show')) closeModal();
});

/* ─── HOME ───────────────────────────────────────────────────────── */

const HOME_TILES = [
  { id: 'sales', name: 'Sales', section: 'ops', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>' },
  { id: 'tables', name: 'Tables', section: 'ops', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
  { id: 'orders', name: 'Previous Orders', section: 'ops', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>' },
  { id: 'kitchen', name: 'Kitchen Display', section: 'ops', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6"/><path d="M4 8a4 4 0 014-4 4 4 0 018 0 4 4 0 014 4v3H4z"/></svg>' },
  { id: 'loyalty', name: 'Loyalty', section: 'ops', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/></svg>' },
  { id: 'scheduling', name: 'Scheduling', section: 'mgmt', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' },
  { id: 'menu-mgmt', name: 'Menu Management', section: 'mgmt', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l3-3 3 3M6 3v6"/><path d="M14 9V3l3 3 3-3"/><path d="M3 18l3 3 3-3"/><path d="M6 12v9"/><path d="M14 21v-6l3 3 3-3"/><path d="M17 12v9"/></svg>' },
  { id: 'inventory', name: 'Inventory', section: 'mgmt', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>' },
  { id: 'analytics', name: 'Analytics', section: 'mgmt', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20h18"/><rect x="5" y="10" width="3" height="10"/><rect x="11" y="6" width="3" height="14"/><rect x="17" y="13" width="3" height="7"/></svg>' },
  { id: 'settings', name: 'Settings', section: 'mgmt', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' }
];

function tileBadge(id) {
  if (id === 'kitchen') {
    const pending = KITCHEN_TICKETS.length - state.bumpedTickets.size;
    return pending > 0 ? `<span class="home-tile-badge" aria-label="${pending} pending">${pending}</span>` : '';
  }
  if (id === 'inventory') {
    const lows = INVENTORY.filter(i => stockStatus(i) !== 'good').length;
    return lows > 0 ? `<span class="home-tile-badge" aria-label="${lows} low or out">${lows}</span>` : '';
  }
  if (id === 'orders') {
    const pending = PAST_ORDERS.filter(o => o.period === 'today' && (o.status === 'pending' || o.status === 'unpaid')).length;
    return pending > 0 ? `<span class="home-tile-badge" aria-label="${pending} need attention">${pending}</span>` : '';
  }
  return '';
}

function renderHome() {
  const renderTile = (t) => `
    <button class="home-tile" data-goto="${t.id}" aria-label="${t.name}">
      ${tileBadge(t.id)}
      <div class="home-tile-icon" aria-hidden="true">${t.icon}</div>
      <div class="home-tile-name">${t.name}</div>
    </button>`;
  $('#opsTiles').innerHTML = HOME_TILES.filter(t => t.section === 'ops').map(renderTile).join('');
  $('#mgmtTiles').innerHTML = HOME_TILES.filter(t => t.section === 'mgmt').map(renderTile).join('');
}

/* ─── SALES ──────────────────────────────────────────────────────── */

function renderMenuTabs() {
  $('#menuTabs').innerHTML = MENU_CATEGORIES.map(c =>
    `<button class="menu-tab${c.id === state.activeMenuCat ? ' active' : ''}" data-cat="${c.id}" role="tab" aria-selected="${c.id === state.activeMenuCat}">${c.name}</button>`
  ).join('');
}

function renderMenuGrid() {
  const search = state.menuSearch.trim().toLowerCase();
  const filtered = search
    ? MENU_ITEMS.filter(m => m.name.toLowerCase().includes(search))
    : MENU_ITEMS.filter(m => m.cat === state.activeMenuCat);

  if (filtered.length === 0) {
    $('#menuGrid').innerHTML = '<div class="menu-grid-empty">No items match your search.</div>';
    return;
  }
  $('#menuGrid').innerHTML = filtered.map(m => {
    const unavail = m.stock === 'out' || state.mgmtToggleState[m.id] === false;
    const imgHtml = `<div class="menu-card-image" style="background-image: url('${m.img}'); background-size: cover; background-position: center; background-color: #F1F5F9;" aria-hidden="true"></div>`;
    return `
      <button class="menu-card${unavail ? ' unavailable' : ''}" data-add="${m.id}" aria-label="Add ${m.name} for ${fmt(m.price)}"${unavail ? ' disabled' : ''}>
        <div class="menu-card-corner" aria-hidden="true"></div>
        ${imgHtml}
        <div class="menu-card-body">
          <div class="menu-card-name">${m.name}</div>
          <div class="menu-card-prices">
            <span class="menu-card-card-price">${fmt(m.price)}</span>
            <span class="menu-card-cash-price">${fmt(m.cash)}</span>
          </div>
        </div>
      </button>`;
  }).join('');
}

function recalcOrder() {
  const subtotal = state.currentOrder.reduce((s, i) => s + i.price * i.qty, 0);
  const cashSubtotal = state.currentOrder.reduce((s, i) => s + (i.cashPrice ?? i.price) * i.qty, 0);
  const taxBase = Math.max(0, subtotal - state.orderDiscount);
  const tax = taxBase * (SETTINGS.tax.rate / 100);
  const cardTotal = taxBase + tax;
  const cashTaxBase = Math.max(0, cashSubtotal - state.orderDiscount);
  const cashTotal = cashTaxBase + cashTaxBase * (SETTINGS.tax.rate / 100);

  $('#subtotal').textContent = fmt(subtotal);
  $('#tax').textContent = fmt(tax);
  $('#cardTotal').textContent = fmt(cardTotal);
  $('#cashTotal').textContent = fmt(cashTotal);

  if (state.orderDiscount > 0) {
    $('#discountRow').style.display = 'flex';
    $('#discountAmt').textContent = '−' + fmt(state.orderDiscount);
  } else {
    $('#discountRow').style.display = 'none';
  }

  const totalQty = state.currentOrder.reduce((s, i) => s + i.qty, 0);
  $('#orderLineCount').textContent = totalQty;
  $('#payBtn').disabled = state.currentOrder.length === 0;
  $('#sendBtn').disabled = state.currentOrder.length === 0;

  if (state.currentOrder.length === 0) {
    $('#orderEmpty').style.display = 'flex';
    $('#orderList').innerHTML = '';
  } else {
    $('#orderEmpty').style.display = 'none';
    $('#orderList').innerHTML = state.currentOrder.map((it, idx) => `
      <div class="order-line" role="listitem">
        <div class="order-line-info">
          <div class="order-line-name">${escapeHtml(it.name)}</div>
          <div class="order-line-meta">${fmt(it.price)} card · ${fmt(it.cashPrice ?? it.price)} cash</div>
          ${it.mods && it.mods.length ? `<div class="order-line-mods">${it.mods.map(escapeHtml).join(' · ')}</div>` : ''}
        </div>
        <div class="qty-control" role="group" aria-label="${escapeHtml(it.name)} quantity">
          <button class="qty-btn" data-act="dec" data-idx="${idx}" aria-label="Decrease">−</button>
          <span class="qty-num" aria-live="polite">${it.qty}</span>
          <button class="qty-btn" data-act="inc" data-idx="${idx}" aria-label="Increase">+</button>
        </div>
      </div>
    `).join('');
  }
}

function addItemToOrder(menuId) {
  const m = MENU_ITEMS.find(x => x.id === menuId);
  if (!m) return;
  if (m.stock === 'out') { toast(m.name + ' is out of stock', true); return; }
  const existing = state.currentOrder.find(i => i.id === m.id && (!i.mods || i.mods.length === 0));
  if (existing) existing.qty += 1;
  else state.currentOrder.push({ id: m.id, name: m.name, price: m.price, cashPrice: m.cash, qty: 1, mods: [] });
  recalcOrder();
  toast(m.name + ' added');
}

function startNewOrder(silent = false) {
  state.currentOrder = [];
  state.orderCustomer = null;
  state.orderNote = '';
  state.orderDiscount = 0;
  state.orderMode = 'takeout';
  state.orderNum += 1;
  $('#orderNum').textContent = 'Order #' + formatOrderNum();
  $('#orderStatus').textContent = 'Draft';
  $('#addCustomerLabel').innerHTML = 'Add Customer <span style="color: var(--slate-400); font-size: 11.5px; margin-left: 3px;">Optional</span>';
  $('#addCustomerBtn').classList.remove('has-customer');
  $('#orderNoteLabel').textContent = 'Add order note…';
  $('#addNoteBtn').classList.remove('has-note');
  $$('.mode-btn').forEach(b => {
    const active = b.dataset.mode === 'takeout';
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', active);
  });
  recalcOrder();
  if (!silent) toast('New order started: #' + formatOrderNum());
}

function openCustomerPicker() {
  const list = CUSTOMERS.map(c => `
    <div class="form-check ${state.orderCustomer && state.orderCustomer.id === c.id ? 'checked' : ''}" data-cust-id="${c.id}" role="button" tabindex="0">
      <span class="form-check-radio" aria-hidden="true"></span>
      <span class="form-check-label">
        <strong>${c.name}</strong>
        <span style="display:block; font-size: 11.5px; color: var(--slate-500); margin-top: 1px;">${c.points} pts · ${c.tier.charAt(0).toUpperCase() + c.tier.slice(1)} · ${c.visits} visits</span>
      </span>
    </div>
  `).join('');
  openModal(`
    <div class="modal-head">
      <div>
        <h2 class="modal-title" id="modalTitle">Add Customer</h2>
        <p class="modal-sub">Link this order to a loyalty member.</p>
      </div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body" id="custList">${list}</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="clearCustomer()">Walk-in</button>
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>
  `);
  const handlePick = (row) => {
    const c = CUSTOMERS.find(x => x.id === row.dataset.custId);
    state.orderCustomer = c;
    $('#addCustomerLabel').innerHTML = `<strong>${c.name}</strong> · ${c.points} pts`;
    $('#addCustomerBtn').classList.add('has-customer');
    $$('.form-check').forEach(f => f.classList.remove('checked'));
    row.classList.add('checked');
    toast(c.name + ' linked');
  };
  $('#custList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-cust-id]');
    if (row) handlePick(row);
  });
  $('#custList').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('[data-cust-id]');
      if (row) { e.preventDefault(); handlePick(row); }
    }
  });
}
window.clearCustomer = function() {
  state.orderCustomer = null;
  $('#addCustomerLabel').innerHTML = 'Add Customer <span style="color: var(--slate-400); font-size: 11.5px; margin-left: 3px;">Optional</span>';
  $('#addCustomerBtn').classList.remove('has-customer');
  closeModal();
  toast('Customer removed');
};

function openNoteEditor() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Order Note</h2><p class="modal-sub">Visible to kitchen and on receipt.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label" for="noteInput">Note</label>
        <textarea class="form-input" id="noteInput" placeholder="e.g. Allergies, special requests…">${escapeHtml(state.orderNote)}</textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveOrderNote()">Save</button>
    </div>
  `);
}
window.saveOrderNote = function() {
  const v = $('#noteInput').value.trim();
  state.orderNote = v;
  if (v) {
    $('#orderNoteLabel').textContent = v.length > 32 ? v.slice(0, 32) + '…' : v;
    $('#addNoteBtn').classList.add('has-note');
  } else {
    $('#orderNoteLabel').textContent = 'Add order note…';
    $('#addNoteBtn').classList.remove('has-note');
  }
  closeModal();
  if (v) toast('Note saved');
};

function openMoreOptions() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">More Options</h2><p class="modal-sub">Apply discounts and adjustments.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Quick discount</label>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
          <button class="btn btn-secondary" onclick="applyDiscountPct(5)">5%</button>
          <button class="btn btn-secondary" onclick="applyDiscountPct(10)">10%</button>
          <button class="btn btn-secondary" onclick="applyDiscountPct(15)">15%</button>
          <button class="btn btn-secondary" onclick="applyDiscountPct(20)">20%</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="discInput">Custom amount ($)</label>
        <input class="form-input" type="number" id="discInput" placeholder="0.00" min="0" step="0.01" value="${state.orderDiscount.toFixed(2)}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" onclick="clearDiscount()">Clear</button>
      <button class="btn btn-primary" onclick="applyCustomDiscount()">Apply</button>
    </div>
  `);
}
window.applyDiscountPct = function(pct) {
  const sub = state.currentOrder.reduce((s, i) => s + i.price * i.qty, 0);
  state.orderDiscount = sub * pct / 100;
  recalcOrder();
  closeModal();
  toast(pct + '% discount applied');
};
window.applyCustomDiscount = function() {
  const v = parseFloat($('#discInput').value) || 0;
  state.orderDiscount = v;
  recalcOrder();
  closeModal();
  toast(v > 0 ? fmt(v) + ' discount applied' : 'Discount cleared');
};
window.clearDiscount = function() {
  state.orderDiscount = 0;
  recalcOrder();
  closeModal();
  toast('Discount cleared');
};

let payMethod = 'card';
function openPaymentModal() {
  if (state.currentOrder.length === 0) return;
  const sub = state.currentOrder.reduce((s, i) => s + i.price * i.qty, 0);
  const cashSub = state.currentOrder.reduce((s, i) => s + (i.cashPrice ?? i.price) * i.qty, 0);
  const taxBase = Math.max(0, sub - state.orderDiscount);
  const cashTaxBase = Math.max(0, cashSub - state.orderDiscount);
  const cardTotal = taxBase + taxBase * (SETTINGS.tax.rate / 100);
  const cashTotal = cashTaxBase + cashTaxBase * (SETTINGS.tax.rate / 100);
  payMethod = 'card';

  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Take Payment</h2><p class="modal-sub">Order #${formatOrderNum()} · ${state.currentOrder.reduce((s, i) => s + i.qty, 0)} items</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="pay-tabs" id="payTabs" role="radiogroup" aria-label="Payment method">
      <button class="pay-tab active" data-method="card" role="radio" aria-checked="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/></svg>
        Card
      </button>
      <button class="pay-tab" data-method="cash" role="radio" aria-checked="false">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/></svg>
        Cash
      </button>
      <button class="pay-tab" data-method="mobile" role="radio" aria-checked="false">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
        Tap
      </button>
    </div>
    <div class="pay-amount-display">
      <div class="pay-amount-label">Total Due</div>
      <div class="pay-amount-value" id="payAmount">${fmt(cardTotal)}</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="processPayment(${cardTotal}, ${cashTotal})">Charge</button>
    </div>
  `);

  $('#payTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.pay-tab');
    if (!t) return;
    $$('.pay-tab').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-checked', 'false'); });
    t.classList.add('active');
    t.setAttribute('aria-checked', 'true');
    payMethod = t.dataset.method;
    $('#payAmount').textContent = fmt(payMethod === 'cash' ? cashTotal : cardTotal);
  });
}

window.processPayment = function(cardTotal, cashTotal) {
  const finalTotal = payMethod === 'cash' ? cashTotal : cardTotal;
  PAST_ORDERS.unshift({
    id: '#' + formatOrderNum(),
    time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    period: 'today',
    mode: state.orderMode === 'dine-in' ? 'dine-in' : (state.orderMode === 'delivery' ? 'delivery' : 'takeaway'),
    customer: state.orderCustomer ? state.orderCustomer.name : 'Walk-in',
    status: 'paid',
    amount: finalTotal
  });
  if (state.currentOrder.length > 0) {
    KITCHEN_TICKETS.unshift({
      id: '#' + formatOrderNum(),
      time: 0.01,
      mode: state.orderMode === 'dine-in' ? 'DINE IN' : 'TO GO',
      items: state.currentOrder.map(it => ({ qty: it.qty, name: it.name, mods: it.mods || [] }))
    });
  }
  state.currentOrder.forEach(it => {
    if (/burger|smash/i.test(it.name)) decInv('I003', it.qty);
    if (/cheesesteak/i.test(it.name)) decInv('I001', it.qty * 0.5);
    if (/chicken/i.test(it.name)) decInv('I002', it.qty * 0.4);
    if (/fries|french/i.test(it.name)) decInv('I004', it.qty * 0.3);
    if (/strawberry|shake/i.test(it.name)) decInv('I009', it.qty * 0.2);
  });
  closeModal();
  toast('Payment of ' + fmt(finalTotal) + ' approved');
  setTimeout(() => startNewOrder(true), 500);
};

function decInv(id, amt) {
  const item = INVENTORY.find(i => i.id === id);
  if (item) item.onHand = Math.max(0, item.onHand - amt);
}

/* ─── TABLES ─────────────────────────────────────────────────────── */

function renderTables() {
  const open = TABLES.filter(t => t.status !== 'empty').length;
  const avail = TABLES.filter(t => t.status === 'empty').length;
  const dirty = TABLES.filter(t => t.status === 'dirty').length;
  const totalRev = TABLES.filter(t => t.status === 'occupied').reduce((s, t) => s + (t.total || 0), 0);

  $('#floorToolbar').innerHTML = `
    <div class="floor-stat"><div><div class="floor-stat-label">Open</div><div class="floor-stat-num">${open}</div></div></div>
    <div class="floor-stat"><div><div class="floor-stat-label">Available</div><div class="floor-stat-num">${avail}</div></div></div>
    <div class="floor-stat"><div><div class="floor-stat-label">Needs cleaning</div><div class="floor-stat-num">${dirty}</div></div></div>
    <div class="floor-stat"><div><div class="floor-stat-label">Open total</div><div class="floor-stat-num">$${Math.round(totalRev)}</div></div></div>
  `;

  $('#floorGrid').innerHTML = TABLES.map(t => {
    if (t.status === 'occupied') {
      return `<button class="floor-table occupied" data-table="${t.num}" aria-label="Table ${t.num}, occupied, party of ${t.party}, ${fmt(t.total)}">
        <div class="floor-table-time">${t.time < 60 ? t.time + 'm' : Math.floor(t.time/60) + 'h ' + (t.time % 60) + 'm'}</div>
        <div class="floor-table-num">${t.num}</div>
        <div class="floor-table-status">Party of ${t.party}</div>
        <div class="floor-table-amount">${fmt(t.total)}</div>
      </button>`;
    } else if (t.status === 'dirty') {
      return `<button class="floor-table dirty" data-table="${t.num}" aria-label="Table ${t.num}, needs bussing">
        <div class="floor-table-num">${t.num}</div>
        <div class="floor-table-status">Bus needed</div>
      </button>`;
    } else {
      return `<button class="floor-table" data-table="${t.num}" aria-label="Table ${t.num}, available">
        <div class="floor-table-num">${t.num}</div>
        <div class="floor-table-status">Available</div>
      </button>`;
    }
  }).join('');

  $$('.floor-table').forEach(el => el.addEventListener('click', () => openTableModal(parseInt(el.dataset.table))));
}

function openTableModal(num) {
  const t = TABLES.find(x => x.num === num);
  if (!t) return;
  let body, actions;
  if (t.status === 'occupied') {
    body = `
      <div class="form-group"><label class="form-label">Status</label><div class="form-input" style="text-align:left;"><strong style="color:var(--brand-500);">Occupied</strong> · Party of ${t.party}</div></div>
      <div class="form-group"><label class="form-label">Open total</label><div class="form-input" style="text-align:left; font-variant-numeric:tabular-nums;">${fmt(t.total)}</div></div>
      <div class="form-group"><label class="form-label">Time at table</label><div class="form-input" style="text-align:left;">${t.time < 60 ? t.time + ' min' : Math.floor(t.time/60) + 'h ' + (t.time % 60) + 'm'}</div></div>
    `;
    actions = `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="closeTable(${num})">Close & Pay</button>`;
  } else if (t.status === 'dirty') {
    body = `<p style="color:var(--slate-600); font-size:14px;">Table ${num} needs to be bussed before reseating.</p>`;
    actions = `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="markClean(${num})">Mark Clean</button>`;
  } else {
    body = `<div class="form-group"><label class="form-label" for="partySize">Party size</label><input class="form-input" type="number" id="partySize" min="1" max="12" value="2"></div>`;
    actions = `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="seatTable(${num})">Seat Party</button>`;
  }
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Table ${num}</h2><p class="modal-sub">${t.status.charAt(0).toUpperCase() + t.status.slice(1)}</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">${body}</div>
    <div class="modal-actions">${actions}</div>
  `);
}
window.seatTable = function(num) {
  const size = parseInt($('#partySize').value) || 2;
  const t = TABLES.find(x => x.num === num);
  t.status = 'occupied'; t.party = size; t.time = 0; t.total = 0;
  closeModal(); renderTables();
  toast(`Table ${num}: party of ${size} seated`);
};
window.closeTable = function(num) {
  const t = TABLES.find(x => x.num === num);
  const total = t.total;
  t.status = 'dirty'; delete t.party; delete t.time; delete t.total;
  closeModal(); renderTables();
  toast(`Table ${num} closed · ${fmt(total)} paid`);
};
window.markClean = function(num) {
  const t = TABLES.find(x => x.num === num);
  t.status = 'empty';
  closeModal(); renderTables();
  toast(`Table ${num} now available`);
};

/* ─── ORDERS ─────────────────────────────────────────────────────── */

function renderOrders() {
  const today = PAST_ORDERS.filter(o => o.period === 'today');
  const needsAttention = today.filter(o => o.status === 'pending' || o.status === 'unpaid').length;
  const refunded = PAST_ORDERS.filter(o => o.status === 'refunded').length;

  $('#ordersPills').innerHTML = `
    <button class="orders-pill ${state.ordersFilter === 'attention' ? 'active' : ''}" data-filter="attention">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
      Needs Attention <span class="num">${needsAttention}</span>
    </button>
    <button class="orders-pill ${state.ordersFilter === 'refunded' ? 'active' : ''}" data-filter="refunded">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/></svg>
      Refunded <span class="num">${refunded}</span>
    </button>
    <button class="orders-pill ${state.ordersFilter === 'dine-in' ? 'active' : ''}" data-filter="dine-in">Dine-In</button>
    <button class="orders-pill ${state.ordersFilter === 'takeaway' ? 'active' : ''}" data-filter="takeaway">Takeaway</button>
    <button class="orders-pill ${state.ordersFilter === 'delivery' ? 'active' : ''}" data-filter="delivery">Delivery</button>
  `;

  const search = state.ordersSearch.trim().toLowerCase();
  let list = state.ordersPeriod === '7d' ? PAST_ORDERS.slice() : PAST_ORDERS.filter(o => o.period === state.ordersPeriod);
  if (state.ordersFilter === 'attention') list = list.filter(o => o.status === 'pending' || o.status === 'unpaid');
  else if (state.ordersFilter === 'refunded') list = list.filter(o => o.status === 'refunded');
  else if (state.ordersFilter) list = list.filter(o => o.mode === state.ordersFilter);
  if (search) list = list.filter(o => o.id.toLowerCase().includes(search) || o.customer.toLowerCase().includes(search));

  if (list.length === 0) {
    $('#ordersList').innerHTML = `<div class="order-row-empty">No orders match these filters.</div>`;
  } else {
    const modeIcon = (m) => {
      if (m === 'dine-in') return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12V8a7 7 0 0114 0v4"/><path d="M3 12h18l-1 9H4l-1-9z"/></svg>';
      if (m === 'delivery') return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/></svg>';
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18l-2 12H5L3 7z"/><path d="M8 7V5a4 4 0 018 0v2"/></svg>';
    };
    const modeLabel = (m) => m === 'dine-in' ? 'Dine-In' : m === 'delivery' ? 'Delivery' : 'Takeaway';

    $('#ordersList').innerHTML = list.map(o => `
      <button class="order-row" data-order-id="${o.id}" aria-label="Order ${o.id}, ${modeLabel(o.mode)}, ${o.customer}, ${o.status}, ${fmt(o.amount)}">
        <div class="order-row-id">${o.id}<span class="order-time">${o.time}</span></div>
        <div class="order-row-mode">${modeIcon(o.mode)}${modeLabel(o.mode)}</div>
        <div class="order-row-customer">${escapeHtml(o.customer)}</div>
        <div><span class="order-status-pill status-${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span></div>
        <div class="order-row-amount">${fmt(o.amount)}</div>
        <div class="order-row-more" aria-hidden="true">···</div>
      </button>
    `).join('');
  }

  $$('.orders-pill').forEach(p => p.addEventListener('click', () => {
    state.ordersFilter = state.ordersFilter === p.dataset.filter ? null : p.dataset.filter;
    renderOrders();
  }));
  $$('.order-row').forEach(r => r.addEventListener('click', () => openOrderDetail(r.dataset.orderId)));
}

function openOrderDetail(orderId) {
  const o = PAST_ORDERS.find(x => x.id === orderId);
  if (!o) return;
  let actions;
  if (o.status === 'pending' || o.status === 'unpaid') actions = `<button class="btn btn-secondary" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="markOrderPaid('${o.id}')">Mark as Paid</button>`;
  else if (o.status === 'paid') actions = `<button class="btn btn-secondary" onclick="closeModal()">Close</button><button class="btn btn-danger" onclick="refundOrder('${o.id}')">Issue Refund</button>`;
  else actions = `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`;
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">${o.id}</h2><p class="modal-sub">${o.time} · ${escapeHtml(o.customer)}</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Mode</label><div class="form-input" style="text-align:left;">${o.mode}</div></div>
      <div class="form-group"><label class="form-label">Status</label><div class="form-input" style="text-align:left;"><span class="order-status-pill status-${o.status}" style="display:inline-block;">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span></div></div>
      <div class="form-group"><label class="form-label">Total</label><div class="form-input" style="text-align:left; font-variant-numeric:tabular-nums; font-weight:700; font-size:18px;">${fmt(o.amount)}</div></div>
    </div>
    <div class="modal-actions">${actions}</div>
  `);
}
window.markOrderPaid = function(id) {
  const o = PAST_ORDERS.find(x => x.id === id);
  if (o) o.status = 'paid';
  closeModal(); renderOrders();
  toast(id + ' marked as paid');
};
window.refundOrder = function(id) {
  const o = PAST_ORDERS.find(x => x.id === id);
  if (o) o.status = 'refunded';
  closeModal(); renderOrders();
  toast(id + ' refunded');
};

/* ─── KITCHEN ────────────────────────────────────────────────────── */

function renderKitchen() {
  const all = KITCHEN_TICKETS.length;
  const togo = KITCHEN_TICKETS.filter(t => /TO GO|TAKEOUT/i.test(t.mode)).length;
  const dineIn = KITCHEN_TICKETS.filter(t => /DINE/i.test(t.mode)).length;
  const served = all - state.bumpedTickets.size;
  const done = state.bumpedTickets.size;

  $('#kitchenToolbar').innerHTML = `
    <button class="kitchen-tab">Cooking <span class="kitchen-tab-num">0</span></button>
    <button class="kitchen-tab active">Served <span class="kitchen-tab-num">${served}</span></button>
    <button class="kitchen-tab">Done <span class="kitchen-tab-num">${done}</span></button>
    <span class="kitchen-spacer"></span>
    <button class="kitchen-tab ${state.kitchenTab === 'all' ? 'active' : ''}" data-tab="all">All <span class="kitchen-tab-num">${all}</span></button>
    <button class="kitchen-tab ${state.kitchenTab === 'togo' ? 'active' : ''}" data-tab="togo">To Go <span class="kitchen-tab-num">${togo}</span></button>
    <button class="kitchen-tab ${state.kitchenTab === 'dine-in' ? 'active' : ''}" data-tab="dine-in">Dine-In <span class="kitchen-tab-num">${dineIn}</span></button>
    <button class="kitchen-mark-all" id="markAllBtn">Mark All Done</button>
  `;

  let list = KITCHEN_TICKETS.slice().filter(t => !state.bumpedTickets.has(t.id));
  if (state.kitchenTab === 'togo') list = list.filter(t => /TO GO|TAKEOUT/i.test(t.mode));
  if (state.kitchenTab === 'dine-in') list = list.filter(t => /DINE/i.test(t.mode));

  if (list.length === 0) {
    $('#kitchenGrid').innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--slate-400); font-size:14px;">All clear. No tickets pending.</div>';
  } else {
    $('#kitchenGrid').innerHTML = list.map(tk => {
      const timeStr = formatKdsTime(tk.time);
      const timeClass = tk.time < 3 ? 'ok' : tk.time < 8 ? 'warning' : '';
      const itemsHtml = tk.items.map((it, idx) => {
        const modsHtml = (it.mods || []).map(m => {
          const cls = m.startsWith('+') ? 'add' : (m.startsWith('×') ? 'remove' : '');
          return `<div class="kds-mod ${cls}">${escapeHtml(m)}</div>`;
        }).join('');
        const divider = idx < tk.items.length - 1 ? '<div class="kds-divider"></div>' : '';
        return `<div class="kds-item"><span class="kds-qty">${it.qty}</span><span class="kds-name">${escapeHtml(it.name)}</span></div>${modsHtml}${divider}`;
      }).join('');
      return `
        <div class="kds-card" data-ticket-id="${tk.id}">
          <div class="kds-head"><span class="kds-num">${tk.id}</span><span class="kds-time ${timeClass}">${timeStr}</span></div>
          <div class="kds-mode"><span class="kds-mode-dot" aria-hidden="true"></span>${tk.mode}</div>
          ${itemsHtml}
          <button class="kds-bump-btn" data-bump="${tk.id}" aria-label="Mark ${tk.id} done">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Bump
          </button>
        </div>
      `;
    }).join('');
  }

  $$('[data-bump]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); bumpTicket(b.dataset.bump); }));
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { state.kitchenTab = b.dataset.tab; renderKitchen(); }));
  const markAll = $('#markAllBtn');
  if (markAll) markAll.addEventListener('click', () => {
    KITCHEN_TICKETS.forEach(t => state.bumpedTickets.add(t.id));
    renderKitchen();
    toast('All tickets marked done');
  });
}

function formatKdsTime(t) {
  const m = Math.floor(t);
  const s = Math.round((t - m) * 100);
  return m + ':' + String(s).padStart(2, '0');
}
function bumpTicket(id) {
  state.bumpedTickets.add(id);
  renderKitchen();
  toast(id + ' bumped');
}

/* ─── LOYALTY ────────────────────────────────────────────────────── */

function renderLoyalty() {
  $('#loyaltyStats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Active Members</div><div class="stat-card-value">2,847</div><span class="stat-card-trend">↑ 12% this month</span></div>
    <div class="stat-card"><div class="stat-card-label">Visits this week</div><div class="stat-card-value">1,294</div><span class="stat-card-trend">↑ 8% vs last week</span></div>
    <div class="stat-card"><div class="stat-card-label">Points redeemed</div><div class="stat-card-value">18,420</div><span class="stat-card-trend">↑ 22% this month</span></div>
    <div class="stat-card"><div class="stat-card-label">Avg ticket - Member</div><div class="stat-card-value">$32.40</div><span class="stat-card-trend">+38% vs non-member</span></div>
  `;

  $('#loyaltyCustomers').innerHTML = CUSTOMERS.slice(0, 5).map(c => `
    <button class="cust-row" data-cust-detail="${c.id}" style="width:100%; text-align:left; background:none; border:none; cursor:pointer;">
      <div class="cust-avatar">${c.initials}</div>
      <div>
        <div class="cust-name">${c.name}</div>
        <div class="cust-meta">${c.visits} visits · Last: ${c.last}</div>
      </div>
      <span class="cust-points">${c.points.toLocaleString()} pts</span>
      <span class="cust-tier ${c.tier}">${c.tier.charAt(0).toUpperCase() + c.tier.slice(1)}</span>
    </button>
  `).join('');

  $('#loyaltyCampaigns').innerHTML = CAMPAIGNS.map((c, idx) => `
    <div class="settings-row">
      <div>
        <div class="settings-row-label">${c.name}</div>
        <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${c.desc}</div>
      </div>
      <button class="toggle-sw ${c.on ? '' : 'off'}" data-campaign="${idx}" role="switch" aria-checked="${c.on}" aria-label="${c.name}"></button>
    </div>
  `).join('');

  $$('[data-cust-detail]').forEach(r => r.addEventListener('click', () => {
    const c = CUSTOMERS.find(x => x.id === r.dataset.custDetail);
    openModal(`
      <div class="modal-head">
        <div><h2 class="modal-title" id="modalTitle">${c.name}</h2><p class="modal-sub">${c.tier.charAt(0).toUpperCase() + c.tier.slice(1)} member · ${c.visits} visits</p></div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Points balance</label><div class="form-input" style="text-align:left; font-weight:700; font-size:18px; color:var(--brand-500);">${c.points.toLocaleString()} pts</div></div>
        <div class="form-group"><label class="form-label">Last visit</label><div class="form-input" style="text-align:left;">${c.last}</div></div>
        <div class="form-group"><label class="form-label">Lifetime visits</label><div class="form-input" style="text-align:left;">${c.visits}</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal(); toast('Message sent to ${c.name}');">Send Message</button>
      </div>
    `);
  }));

  $$('[data-campaign]').forEach(t => t.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = parseInt(t.dataset.campaign);
    CAMPAIGNS[idx].on = !CAMPAIGNS[idx].on;
    t.classList.toggle('off', !CAMPAIGNS[idx].on);
    t.setAttribute('aria-checked', CAMPAIGNS[idx].on);
    toast(CAMPAIGNS[idx].name + (CAMPAIGNS[idx].on ? ' enabled' : ' disabled'));
  }));

  $('#newCampaignBtn').addEventListener('click', () => {
    openModal(`
      <div class="modal-head">
        <div><h2 class="modal-title" id="modalTitle">New Campaign</h2><p class="modal-sub">Reach members at the right moment.</p></div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label" for="campName">Name</label><input class="form-input" id="campName" placeholder="e.g. Happy Hour Special"></div>
        <div class="form-group"><label class="form-label" for="campDesc">Description</label><input class="form-input" id="campDesc" placeholder="Free side · Mon–Wed 3–5pm"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="addCampaign()">Create</button>
      </div>
    `);
  });
}

window.addCampaign = function() {
  const n = $('#campName').value.trim();
  const d = $('#campDesc').value.trim();
  if (!n) { toast('Name required', true); return; }
  CAMPAIGNS.push({ name: n, desc: d || 'New campaign', on: true });
  closeModal(); renderLoyalty();
  toast('Campaign created');
};

/* ─── INVENTORY ──────────────────────────────────────────────────── */

function renderInventory() {
  const inStock = INVENTORY.filter(i => stockStatus(i) === 'good').length;
  const low = INVENTORY.filter(i => stockStatus(i) === 'low').length;
  const out = INVENTORY.filter(i => stockStatus(i) === 'out').length;
  const totalVal = INVENTORY.reduce((s, i) => s + i.cost * i.onHand, 0);

  $('#invStats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Items in stock</div><div class="stat-card-value">${inStock}</div></div>
    <div class="stat-card"><div class="stat-card-label">Low stock</div><div class="stat-card-value" style="color:var(--warning);">${low}</div></div>
    <div class="stat-card"><div class="stat-card-label">Out of stock</div><div class="stat-card-value" style="color:var(--danger);">${out}</div></div>
    <div class="stat-card"><div class="stat-card-label">Total value</div><div class="stat-card-value">$${Math.round(totalVal).toLocaleString()}</div></div>
  `;

  let list = INVENTORY.slice();
  if (state.invFilter === 'low') list = list.filter(i => stockStatus(i) === 'low');
  if (state.invFilter === 'out') list = list.filter(i => stockStatus(i) === 'out');
  if (state.invFilter === 'recipe') list = list.filter(i => i.recipe);

  if (list.length === 0) {
    $('#invList').innerHTML = '<div class="inv-row-empty">No items match this filter.</div>';
  } else {
    $('#invList').innerHTML = list.map(i => {
      const status = stockStatus(i);
      const pct = Math.round(i.onHand / i.max * 100);
      const fillClass = status === 'good' ? '' : status === 'low' ? 'warning' : 'danger';
      const statusLabel = status === 'good' ? 'In stock' : status === 'low' ? 'Low' : 'Out';
      const actionLabel = status === 'out' ? 'Order today' : status === 'low' ? 'Reorder now' : 'Reorder';
      const actionColor = status === 'out' ? 'var(--danger)' : status === 'low' ? 'var(--warning)' : 'var(--brand-500)';
      return `
        <div class="inv-row" role="row">
          <div class="inv-name">${i.name}<small class="inv-name-sku">SKU: ${i.sku}</small></div>
          <div class="inv-cell tabular">${fmt(i.cost)} / ${i.unit}</div>
          <div class="inv-cell tabular">${i.onHand.toFixed(i.onHand < 10 && i.onHand > 0 ? 1 : 0)} ${i.unit}</div>
          <div class="inv-stock-bar">
            <div class="inv-stock-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="inv-stock-bar-fill ${fillClass}" style="width:${pct}%;"></div></div>
            <span class="inv-stock-num">${pct}%</span>
          </div>
          <div><span class="inv-status ${status}">${statusLabel}</span></div>
          <button class="inv-action-btn" data-reorder="${i.id}" style="color:${actionColor}; background:none; border:none; cursor:pointer; font-weight:600;">${actionLabel}</button>
        </div>
      `;
    }).join('');
  }

  $$('[data-inv-filter]').forEach(b => b.addEventListener('click', () => {
    state.invFilter = b.dataset.invFilter;
    $$('[data-inv-filter]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
    renderInventory();
  }));
  $$('[data-reorder]').forEach(b => b.addEventListener('click', () => openReorder(b.dataset.reorder)));
}

function openReorder(itemId) {
  const item = INVENTORY.find(x => x.id === itemId);
  if (!item) return;
  const suggested = Math.max(1, Math.round(item.max - item.onHand));
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Reorder ${item.name}</h2><p class="modal-sub">Current: ${item.onHand.toFixed(1)} ${item.unit} · Par: ${item.max} ${item.unit}</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="reorderQty">Quantity to order</label><input class="form-input" type="number" id="reorderQty" min="1" value="${suggested}"></div>
      <div class="form-group"><label class="form-label">Estimated cost</label><div class="form-input" id="reorderCost" style="text-align:left; font-weight:700;">${fmt(item.cost * suggested)}</div></div>
      <div class="form-group"><label class="form-label">Delivery</label><div class="form-input" style="text-align:left;">Standard · 1–2 business days</div></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="placeReorder('${itemId}')">Place Order</button>
    </div>
  `);
  $('#reorderQty').addEventListener('input', (e) => {
    const q = parseInt(e.target.value) || 0;
    $('#reorderCost').textContent = fmt(item.cost * q);
  });
}
window.placeReorder = function(itemId) {
  const item = INVENTORY.find(x => x.id === itemId);
  const q = parseInt($('#reorderQty').value) || 0;
  if (q > 0) {
    item.onHand += q;
    closeModal(); renderInventory();
    toast(`Ordered ${q} ${item.unit} of ${item.name}`);
  } else {
    closeModal();
  }
};

/* ─── ANALYTICS ──────────────────────────────────────────────────── */

const SALES_DATA = {
  today: { days: ['9a','11a','1p','3p','5p','7p','9p'], values: [890,1240,1880,1620,2110,2850,1340], total: 11860, orders: 184, avg: 64.40 },
  '7d': { days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values: [8400,9200,11100,10800,14600,15200,11900], total: 81200, orders: 1284, avg: 63.20 },
  '30d': { days: ['Wk 1','Wk 2','Wk 3','Wk 4','Wk 5'], values: [62100,68400,71800,79200,81200], total: 362700, orders: 5641, avg: 64.30 },
  ytd: { days: ['Jan','Feb','Mar','Apr','May'], values: [218400,224800,256100,271400,81200], total: 1051900, orders: 16284, avg: 64.60 }
};

function renderAnalytics() {
  const data = SALES_DATA[state.anaPeriod];
  $('#anaPeriodLabel').textContent = state.anaPeriod === 'today' ? 'Today, May 6 2026' :
    state.anaPeriod === '7d' ? 'Last 7 days · Apr 30 – May 6' :
    state.anaPeriod === '30d' ? 'Last 30 days · Apr 7 – May 6' : 'Year to date · 2026';

  $('#anaGrid').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Net Sales</div><div class="stat-card-value">$${data.total.toLocaleString()}</div><span class="stat-card-trend">↑ 14% vs prev</span></div>
    <div class="stat-card"><div class="stat-card-label">Orders</div><div class="stat-card-value">${data.orders.toLocaleString()}</div><span class="stat-card-trend">↑ 9% vs prev</span></div>
    <div class="stat-card"><div class="stat-card-label">Avg Ticket</div><div class="stat-card-value">$${data.avg.toFixed(2)}</div><span class="stat-card-trend">↑ 4% vs prev</span></div>
    <div class="stat-card"><div class="stat-card-label">Labor %</div><div class="stat-card-value">28<span>%</span></div><span class="stat-card-trend" style="background:var(--warning-soft); color:var(--warning);">↑ 2% above target</span></div>
  `;

  const max = Math.max(...data.values);
  $('#chartBars').innerHTML = data.days.map((day, i) => {
    const h = data.values[i] / max * 100;
    const v = data.values[i] >= 1000 ? '$' + (data.values[i] / 1000).toFixed(1) + 'k' : '$' + data.values[i];
    return `<div class="chart-bar-col"><div class="chart-bar-value">${v}</div><div class="chart-bar" style="height:${h}%;" title="${day}: ${v}" aria-label="${day}: ${v}"></div><div class="chart-bar-label">${day}</div></div>`;
  }).join('');

  $('#topItemsList').innerHTML = `
    <div class="top-item"><div class="top-item-rank">01</div><div><div class="top-item-name">Cheesesteak Sandwich</div><div class="top-item-qty">214 sold</div></div><div></div><div class="top-item-rev">$3,635</div></div>
    <div class="top-item"><div class="top-item-rank">02</div><div><div class="top-item-name">Crispy Chicken Sandwich</div><div class="top-item-qty">198 sold</div></div><div></div><div class="top-item-rev">$2,077</div></div>
    <div class="top-item"><div class="top-item-rank">03</div><div><div class="top-item-name">Loaded Fries</div><div class="top-item-qty">142 sold</div></div><div></div><div class="top-item-rev">$1,930</div></div>
    <div class="top-item"><div class="top-item-rank">04</div><div><div class="top-item-name">Chicken Tenders</div><div class="top-item-qty">128 sold</div></div><div></div><div class="top-item-rev">$1,521</div></div>
    <div class="top-item"><div class="top-item-rank">05</div><div><div class="top-item-name">Smash Burger</div><div class="top-item-qty">102 sold</div></div><div></div><div class="top-item-rev">$1,008</div></div>
  `;

  $('#paymentMix').innerHTML = `
    <div class="breakdown-row"><div class="breakdown-label">Card</div><div class="breakdown-track"><div class="breakdown-fill" style="width:71%;"></div></div><div class="breakdown-pct">71%</div></div>
    <div class="breakdown-row"><div class="breakdown-label">Cash</div><div class="breakdown-track"><div class="breakdown-fill" style="width:22%; background:var(--success);"></div></div><div class="breakdown-pct">22%</div></div>
    <div class="breakdown-row"><div class="breakdown-label">Apple/Google</div><div class="breakdown-track"><div class="breakdown-fill" style="width:7%; background:var(--brand-300);"></div></div><div class="breakdown-pct">7%</div></div>
  `;

  $('#channelMix').innerHTML = `
    <div class="breakdown-row"><div class="breakdown-label">Dine-In</div><div class="breakdown-track"><div class="breakdown-fill" style="width:42%;"></div></div><div class="breakdown-pct">42%</div></div>
    <div class="breakdown-row"><div class="breakdown-label">Takeout</div><div class="breakdown-track"><div class="breakdown-fill" style="width:38%;"></div></div><div class="breakdown-pct">38%</div></div>
    <div class="breakdown-row"><div class="breakdown-label">Delivery</div><div class="breakdown-track"><div class="breakdown-fill" style="width:20%;"></div></div><div class="breakdown-pct">20%</div></div>
  `;

  $$('[data-ana-period]').forEach(b => b.addEventListener('click', () => {
    state.anaPeriod = b.dataset.anaPeriod;
    $$('[data-ana-period]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
    renderAnalytics();
  }));

  $('#exportCsvBtn').addEventListener('click', () => {
    const csv = 'Day,Sales\n' + data.days.map((d, i) => `${d},${data.values[i]}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sales-' + state.anaPeriod + '.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported');
  });
}

/* ─── MENU MGMT ──────────────────────────────────────────────────── */

function renderMenuMgmt() {
  $('#mgmtTabs').innerHTML = MENU_CATEGORIES.map(c =>
    `<button class="mgmt-tab${c.id === state.mgmtCat ? ' active' : ''}" data-mgmt-cat="${c.id}" role="tab">${c.name}</button>`
  ).join('');

  const items = MENU_ITEMS.filter(m => m.cat === state.mgmtCat);
  $('#mgmtGrid').innerHTML = items.map(m => {
    const enabled = state.mgmtToggleState[m.id] !== false;
    const imgHtml = `<div class="mgmt-card-image" style="background-image: url('${m.img}'); background-size: cover; background-position: center; background-color: #F1F5F9;" aria-hidden="true"></div>`;
    return `
      <div class="mgmt-card ${enabled ? '' : 'disabled'}">
        ${imgHtml}
        <div class="mgmt-card-body">
          <div class="mgmt-card-name">${m.name}</div>
          <div class="mgmt-card-meta">
            <span class="mgmt-card-price">${fmt(m.price)}</span>
            <button class="mgmt-card-toggle ${enabled ? '' : 'off'}" data-mgmt-toggle="${m.id}" role="switch" aria-checked="${enabled}" aria-label="Toggle ${m.name}"></button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  $$('[data-mgmt-cat]').forEach(t => t.addEventListener('click', () => { state.mgmtCat = t.dataset.mgmtCat; renderMenuMgmt(); }));
  $$('[data-mgmt-toggle]').forEach(t => t.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = t.dataset.mgmtToggle;
    const m = MENU_ITEMS.find(x => x.id === id);
    state.mgmtToggleState[id] = state.mgmtToggleState[id] === false;
    t.classList.toggle('off', !state.mgmtToggleState[id]);
    t.setAttribute('aria-checked', state.mgmtToggleState[id]);
    t.closest('.mgmt-card').classList.toggle('disabled', !state.mgmtToggleState[id]);
    toast(`${m.name} ${state.mgmtToggleState[id] ? 'enabled' : 'hidden'}`);
  }));

  $('#mgmtAddBtn').addEventListener('click', () => {
    openModal(`
      <div class="modal-head">
        <div><h2 class="modal-title" id="modalTitle">Add Menu Item</h2><p class="modal-sub">Add to ${MENU_CATEGORIES.find(c => c.id === state.mgmtCat).name}.</p></div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label" for="newItemName">Name</label><input class="form-input" id="newItemName" placeholder="e.g. Pulled Pork Sandwich"></div>
        <div class="form-group"><label class="form-label" for="newItemPrice">Card price ($)</label><input class="form-input" type="number" id="newItemPrice" step="0.01" min="0" placeholder="0.00"></div>
        <div class="form-group"><label class="form-label" for="newItemCash">Cash price ($)</label><input class="form-input" type="number" id="newItemCash" step="0.01" min="0" placeholder="0.00"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="addMenuItem()">Add Item</button>
      </div>
    `);
  });
}

window.addMenuItem = function() {
  const n = $('#newItemName').value.trim();
  const p = parseFloat($('#newItemPrice').value);
  const c = parseFloat($('#newItemCash').value);
  if (!n || isNaN(p) || isNaN(c)) { toast('Please fill all fields', true); return; }
  const newId = 'M' + String(Date.now()).slice(-4);
  MENU_ITEMS.push({ id: newId, cat: state.mgmtCat, name: n, price: p, cash: c, stock: 'good' });
  closeModal(); renderMenuMgmt();
  toast(`${n} added`);
};

/* ─── SCHEDULING ─────────────────────────────────────────────────── */

function parseTimeStr(t) {
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
}

function renderScheduling() {
  let totalHours = 0;
  STAFF.forEach(st => {
    st.shifts.forEach(x => {
      if (x === 'off' || x === 'open') return;
      const parts = x.split('–');
      if (parts.length !== 2) return;
      let start = parseTimeStr(parts[0]);
      let end = parseTimeStr(parts[1]);
      // PM normalization for typical restaurant hours
      if (end < start) end += 12;
      totalHours += (end - start);
    });
  });
  const cost = Math.round(totalHours * 19.4);
  const openShifts = STAFF.flatMap(st => st.shifts).filter(s => s === 'open').length;

  $('#schedStats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total hours this week</div><div class="stat-card-value">${Math.round(totalHours)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Labor cost</div><div class="stat-card-value">$${cost.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-card-label">Open shifts</div><div class="stat-card-value" style="color:var(--warning);">${openShifts}</div></div>
    <div class="stat-card"><div class="stat-card-label">Time-off requests</div><div class="stat-card-value">3</div></div>
  `;

  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dates = ['May 4','May 5','May 6','May 7','May 8','May 9','May 10'];

  let html = `<div class="sched-week-head"><div class="sched-week-cell-h staff">Staff</div>`;
  days.forEach((d, i) => html += `<div class="sched-week-cell-h">${d}<div class="day-num">${dates[i]}</div></div>`);
  html += `</div>`;

  STAFF.forEach((st, sIdx) => {
    html += `<div class="sched-row">
      <div class="sched-staff">
        <div class="sched-staff-avatar" style="background:${st.color};">${st.initials}</div>
        <div>
          <div class="sched-staff-name">${st.name}</div>
          <div class="sched-staff-role">${st.role}</div>
        </div>
      </div>`;
    st.shifts.forEach((sh, dIdx) => {
      let shiftHtml;
      if (sh === 'off') shiftHtml = `<div class="shift off">Off</div>`;
      else if (sh === 'open') shiftHtml = `<div class="shift warn">Open shift</div>`;
      else shiftHtml = `<div class="shift">${sh}</div>`;
      html += `<button class="sched-cell" data-staff="${sIdx}" data-day="${dIdx}" aria-label="${st.name} ${days[dIdx]}: ${sh}" style="background:none; border:none; cursor:pointer; text-align:left;">${shiftHtml}</button>`;
    });
    html += `</div>`;
  });

  $('#schedWeek').innerHTML = html;
  $$('.sched-cell').forEach(c => c.addEventListener('click', () => openShiftEditor(parseInt(c.dataset.staff), parseInt(c.dataset.day))));
}

function openShiftEditor(sIdx, dIdx) {
  const st = STAFF[sIdx];
  const cur = st.shifts[dIdx];
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">${st.name} · ${days[dIdx]}</h2><p class="modal-sub">${st.role}</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label" for="shiftInput">Shift (e.g. 9:00–5:00)</label>
        <input class="form-input" type="text" id="shiftInput" placeholder="9:00–5:00 or off" value="${cur === 'open' || cur === 'off' ? '' : cur}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" onclick="setShift(${sIdx}, ${dIdx}, 'off')">Mark Off</button>
      <button class="btn btn-primary" onclick="saveShift(${sIdx}, ${dIdx})">Save</button>
    </div>
  `);
}
window.setShift = function(sIdx, dIdx, value) {
  STAFF[sIdx].shifts[dIdx] = value;
  closeModal(); renderScheduling();
  toast('Shift updated');
};
window.saveShift = function(sIdx, dIdx) {
  const v = $('#shiftInput').value.trim();
  STAFF[sIdx].shifts[dIdx] = v || 'off';
  closeModal(); renderScheduling();
  toast('Shift saved');
};

/* ─── SETTINGS ───────────────────────────────────────────────────── */

const SETTINGS_PANES = [
  { id: 'general', name: 'General', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>' },
  { id: 'payments', name: 'Payments', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/></svg>' },
  { id: 'hardware', name: 'Hardware', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M9 21h6M12 17v4"/></svg>' },
  { id: 'tax', name: 'Tax & Service', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 15h.01M16 8l-8 8"/></svg>' },
  { id: 'staff', name: 'Staff & Roles', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' },
  { id: 'integrations', name: 'Integrations', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>' },
  { id: 'audit', name: 'Audit Log', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' }
];

function renderSettings() {
  $('#settingsNav').innerHTML = SETTINGS_PANES.map(p => `
    <button class="settings-nav-item ${p.id === state.settingsPane ? 'active' : ''}" data-pane="${p.id}" aria-current="${p.id === state.settingsPane ? 'true' : 'false'}">
      ${p.icon}
      ${p.name}
    </button>
  `).join('');

  $('#settingsContent').innerHTML = renderSettingsPane(state.settingsPane);

  $$('[data-pane]').forEach(b => b.addEventListener('click', () => {
    state.settingsPane = b.dataset.pane;
    renderSettings();
  }));

  // Wire toggles
  $$('#settingsContent [data-toggle]').forEach(t => t.addEventListener('click', () => {
    const [grp, key] = t.dataset.toggle.split('.');
    SETTINGS[grp][key] = !SETTINGS[grp][key];
    t.classList.toggle('off', !SETTINGS[grp][key]);
    t.setAttribute('aria-checked', SETTINGS[grp][key]);
    toast('Setting updated');
  }));
  // Wire inputs
  $$('#settingsContent [data-input]').forEach(inp => inp.addEventListener('change', () => {
    const [grp, key] = inp.dataset.input.split('.');
    const val = inp.type === 'number' ? parseFloat(inp.value) : inp.value;
    SETTINGS[grp][key] = val;
    toast('Saved');
  }));
}

function renderSettingsPane(pane) {
  if (pane === 'general') {
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Business</h3>
        <p class="settings-section-desc">How DEXA identifies your restaurant on receipts and reports.</p>
        <div class="settings-row"><span class="settings-row-label">Business name</span><input class="settings-row-input" data-input="business.name" value="${SETTINGS.business.name}"></div>
        <div class="settings-row"><span class="settings-row-label">Default location</span><input class="settings-row-input" data-input="business.location" value="${SETTINGS.business.location}"></div>
        <div class="settings-row"><span class="settings-row-label">Time zone</span><span class="settings-row-value">${SETTINGS.business.tz}</span></div>
        <div class="settings-row"><span class="settings-row-label">Currency</span><span class="settings-row-value">${SETTINGS.business.currency}</span></div>
      </div>
      <div class="settings-section">
        <h3 class="settings-section-title">Operations</h3>
        <p class="settings-section-desc">Behavior across the floor and kitchen.</p>
        ${[
          ['cashDiscount','Cash discount enabled'],
          ['tipPrompts','Tip-at-sale prompts'],
          ['allergenFlags','Allergen flags on KDS'],
          ['autoPrint','Auto-print kitchen tickets'],
          ['managerPin','Manager-PIN for voids'],
          ['offline','Offline mode'],
          ['customerDisplay','Customer-facing display']
        ].map(([k, label]) => `
          <div class="settings-row">
            <span class="settings-row-label">${label}</span>
            <button class="toggle-sw ${SETTINGS.ops[k] ? '' : 'off'}" data-toggle="ops.${k}" role="switch" aria-checked="${SETTINGS.ops[k]}" aria-label="${label}"></button>
          </div>
        `).join('')}
      </div>
      <div class="settings-section">
        <h3 class="settings-section-title">Notifications</h3>
        <p class="settings-section-desc">Who gets pinged when something needs attention.</p>
        ${[
          ['lowStock','Low-stock alerts'],
          ['suspicious','Suspicious-pattern alerts'],
          ['dailyEmail','Daily closeout email']
        ].map(([k, label]) => `
          <div class="settings-row">
            <span class="settings-row-label">${label}</span>
            <button class="toggle-sw ${SETTINGS.notif[k] ? '' : 'off'}" data-toggle="notif.${k}" role="switch" aria-checked="${SETTINGS.notif[k]}" aria-label="${label}"></button>
          </div>
        `).join('')}
      </div>
    `;
  }
  if (pane === 'payments') {
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Accepted Methods</h3>
        <p class="settings-section-desc">Choose which payment methods appear on the pay screen.</p>
        ${[
          ['card','Credit & debit cards'],
          ['cash','Cash'],
          ['mobile','Apple Pay / Google Pay'],
          ['gift','Gift cards']
        ].map(([k, label]) => `
          <div class="settings-row">
            <span class="settings-row-label">${label}</span>
            <button class="toggle-sw ${SETTINGS.payments[k] ? '' : 'off'}" data-toggle="payments.${k}" role="switch" aria-checked="${SETTINGS.payments[k]}" aria-label="${label}"></button>
          </div>
        `).join('')}
      </div>
      <div class="settings-section">
        <h3 class="settings-section-title">Processor</h3>
        <p class="settings-section-desc">Connected payment processor and rates.</p>
        <div class="settings-row"><span class="settings-row-label">Processor</span><span class="settings-row-value">DEXA Pay (Stripe)</span></div>
        <div class="settings-row"><span class="settings-row-label">Card rate</span><span class="settings-row-value">2.6% + $0.10</span></div>
        <div class="settings-row"><span class="settings-row-label">Next deposit</span><span class="settings-row-value">Tomorrow, 9:00 AM</span></div>
      </div>
    `;
  }
  if (pane === 'hardware') {
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Connected Devices</h3>
        <p class="settings-section-desc">Hardware paired with this station.</p>
        <div class="settings-row"><span class="settings-row-label">Receipt printer</span><span class="settings-row-value" style="color:var(--success);">● Connected · Star TSP143</span></div>
        <div class="settings-row"><span class="settings-row-label">Kitchen printer</span><span class="settings-row-value" style="color:var(--success);">● Connected · Epson U220B</span></div>
        <div class="settings-row"><span class="settings-row-label">Cash drawer</span><span class="settings-row-value" style="color:var(--success);">● Connected</span></div>
        <div class="settings-row"><span class="settings-row-label">Card reader</span><span class="settings-row-value" style="color:var(--success);">● Connected · Stripe M2</span></div>
        <div class="settings-row"><span class="settings-row-label">Customer display</span><span class="settings-row-value" style="color:var(--slate-400);">○ Not connected</span></div>
        <div class="settings-row"><span class="settings-row-label">Barcode scanner</span><span class="settings-row-value" style="color:var(--slate-400);">○ Not connected</span></div>
      </div>
    `;
  }
  if (pane === 'tax') {
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Sales Tax</h3>
        <p class="settings-section-desc">Applied to all taxable items at checkout.</p>
        <div class="settings-row"><span class="settings-row-label">Tax rate (%)</span><input class="settings-row-input" type="number" step="0.01" min="0" max="20" data-input="tax.rate" value="${SETTINGS.tax.rate}"></div>
      </div>
      <div class="settings-section">
        <h3 class="settings-section-title">Service Charge</h3>
        <p class="settings-section-desc">Optional auto-grat for large parties.</p>
        <div class="settings-row"><span class="settings-row-label">Auto-grat for parties of 6+</span><span class="settings-row-value">18%</span></div>
      </div>
    `;
  }
  if (pane === 'staff') {
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Staff Members</h3>
        <p class="settings-section-desc">${STAFF.length} active employees · See full list in Scheduling.</p>
        ${STAFF.map(s => `
          <div class="settings-row">
            <span class="settings-row-label" style="display:flex; align-items:center; gap:10px;">
              <span class="user-avatar" style="background:${s.color}; width:28px; height:28px; font-size:10px;">${s.initials}</span>
              ${s.name}
            </span>
            <span class="settings-row-value">${s.role}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  if (pane === 'integrations') {
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Connected Services</h3>
        <p class="settings-section-desc">Third-party apps integrated with DEXA.</p>
        <div class="settings-row"><span class="settings-row-label">QuickBooks</span><span class="settings-row-value" style="color:var(--success);">● Connected</span></div>
        <div class="settings-row"><span class="settings-row-label">Mailchimp</span><span class="settings-row-value" style="color:var(--success);">● Connected</span></div>
        <div class="settings-row"><span class="settings-row-label">DoorDash</span><span class="settings-row-value" style="color:var(--success);">● Connected</span></div>
        <div class="settings-row"><span class="settings-row-label">Uber Eats</span><span class="settings-row-value" style="color:var(--slate-400);">○ Available</span></div>
        <div class="settings-row"><span class="settings-row-label">Resy</span><span class="settings-row-value" style="color:var(--slate-400);">○ Available</span></div>
        <div class="settings-row"><span class="settings-row-label">7shifts</span><span class="settings-row-value" style="color:var(--success);">● Connected</span></div>
      </div>
    `;
  }
  if (pane === 'audit') {
    const events = [
      { time: '5:42 PM', event: 'Payment processed', detail: 'Order #S1-0007 · $42.30 · Card', user: 'Avery R' },
      { time: '5:31 PM', event: 'Discount applied', detail: '10% off · Order #S1-0006', user: 'Avery R' },
      { time: '5:14 PM', event: 'Order voided', detail: 'Order #S1-0005 · Manager PIN required', user: 'Jordan P' },
      { time: '4:48 PM', event: 'Inventory updated', detail: 'Whole Milk · 12 gal received', user: 'Avery R' },
      { time: '3:33 PM', event: 'Refund issued', detail: 'Order #Y1-0039 · $14.50', user: 'Avery R' },
      { time: '2:15 PM', event: 'Settings changed', detail: 'Tax rate updated to 8.88%', user: 'Avery R' },
      { time: '1:11 PM', event: 'Staff clocked in', detail: 'Casey Walker · Server', user: 'System' }
    ];
    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Recent Activity</h3>
        <p class="settings-section-desc">Last 7 events. Full log retained for 90 days.</p>
        ${events.map(e => `
          <div class="settings-row">
            <div>
              <div class="settings-row-label">${e.event}</div>
              <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${e.detail}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px; color:var(--ink); font-weight:600;">${e.time}</div>
              <div style="font-size:11px; color:var(--slate-500);">${e.user}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  return '';
}

/* ─── GLOBAL EVENT WIRING ────────────────────────────────────────── */

document.addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) { e.preventDefault(); showScreen(goto.dataset.goto); return; }
});

// Sales — menu cards
$('#menuGrid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-add]');
  if (card && !card.disabled) addItemToOrder(card.dataset.add);
});
// Menu tab clicks
$('#menuTabs').addEventListener('click', (e) => {
  const t = e.target.closest('.menu-tab');
  if (!t) return;
  state.activeMenuCat = t.dataset.cat;
  state.menuSearch = '';
  $('#menuSearch').value = '';
  renderMenuTabs();
  renderMenuGrid();
});
// Menu search
$('#menuSearch').addEventListener('input', (e) => {
  state.menuSearch = e.target.value;
  renderMenuGrid();
});
// Order qty controls
$('#orderList').addEventListener('click', (e) => {
  const btn = e.target.closest('.qty-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx);
  if (btn.dataset.act === 'inc') state.currentOrder[idx].qty += 1;
  else {
    state.currentOrder[idx].qty -= 1;
    if (state.currentOrder[idx].qty <= 0) state.currentOrder.splice(idx, 1);
  }
  recalcOrder();
});
// Mode buttons
$$('.mode-btn').forEach(b => b.addEventListener('click', () => {
  state.orderMode = b.dataset.mode;
  $$('.mode-btn').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
  b.classList.add('active');
  b.setAttribute('aria-checked', 'true');
}));
// Order action buttons
$('#payBtn').addEventListener('click', openPaymentModal);
$('#sendBtn').addEventListener('click', () => {
  if (state.currentOrder.length === 0) return;
  $('#orderStatus').textContent = 'Sent to kitchen';
  toast('Order sent to kitchen');
});
$('#newOrderBtn').addEventListener('click', () => startNewOrder());
$('#trashBtn').addEventListener('click', () => {
  if (state.currentOrder.length === 0) return;
  if (confirm('Clear current order?')) {
    state.currentOrder = [];
    state.orderDiscount = 0;
    recalcOrder();
    toast('Order cleared');
  }
});
$('#addCustomerBtn').addEventListener('click', openCustomerPicker);
$('#addNoteBtn').addEventListener('click', openNoteEditor);
$('#moreOptionsBtn').addEventListener('click', openMoreOptions);
$('#otherOrderBtn').addEventListener('click', () => toast('Switching to order #S5-0001…'));
$('#completeAllBtn').addEventListener('click', () => toast('All preparing orders marked complete'));

// Orders period filter
$$('[data-period]').forEach(b => b.addEventListener('click', () => {
  state.ordersPeriod = b.dataset.period;
  $$('[data-period]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
  b.classList.add('active');
  b.setAttribute('aria-selected', 'true');
  renderOrders();
}));
$('#ordersSearch').addEventListener('input', (e) => {
  state.ordersSearch = e.target.value;
  renderOrders();
});

/* ─── LIVE TIME ──────────────────────────────────────────────────── */

function updateTime() {
  const now = new Date();
  const t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  $('#liveTime').textContent = 'Online · ' + t;
}
updateTime();
setInterval(updateTime, 30000);

/* ─── DARK MODE TOGGLE ──────────────────────────────────────────── */

(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('dexa-theme'); } catch (e) {}
  // Default: respect system preference if no choice has been made
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = saved === 'dark' || (saved === null && prefersDark);
  if (useDark) {
    document.body.classList.add('dark');
    const btn = $('#themeToggle');
    if (btn) btn.setAttribute('aria-pressed', 'true');
  }

  const toggle = $('#themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark');
      toggle.setAttribute('aria-pressed', String(isDark));
      try { localStorage.setItem('dexa-theme', isDark ? 'dark' : 'light'); } catch (e) {}
      toast(isDark ? 'Dark mode on' : 'Light mode on');
    });
  }
})();

/* ─── INIT ───────────────────────────────────────────────────────── */

renderHome();
renderMenuTabs();
renderMenuGrid();
recalcOrder();
$('#orderNum').textContent = 'Order #' + formatOrderNum();
