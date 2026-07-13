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

// Item descriptions — one-liner for each item (shown in product detail panel)
const ITEM_DESCRIPTIONS = {
  'M001': 'Thinly shaved ribeye, melted provolone & sautéed onions on a hoagie roll',
  'M002': 'Hand-breaded chicken tenders, crispy outside, juicy inside',
  'M003': 'Buttermilk-fried chicken, pickles & house slaw on brioche',
  'M004': 'Crispy fries piled with cheese sauce, bacon & scallions',
  'M005': '20 piece tender platter — perfect for sharing or game day',
  'M006': 'Crispy buffalo chicken, ranch slaw & blue cheese wrapped tight',
  'M007': 'Salami, ham, capicola, provolone, lettuce, tomato & oil-vinegar',
  'M008': 'Triple-decker turkey, bacon, lettuce, tomato & mayo on toasted sourdough',
  'M010': 'Juicy smash burgers with crispy edges, melty cheese & house sauce',
  'M011': 'Double the patties, double the cheese — full-throttle smash',
  'M012': 'Smash patty topped with thick-cut bacon & melted American',
  'M013': 'Sautéed mushrooms, Swiss cheese & garlic aioli on a juicy patty',
  'M014': 'House-made plant patty, avocado, sprouts & vegan aioli',
  'M020': 'Hand-cut russet potatoes, double-fried golden & sea-salted',
  'M021': 'Beer-battered Vidalia onions, crispy & sweet',
  'M022': 'Hand-breaded mozzarella, fried golden with marinara dip',
  'M023': 'Spicy jalapeños stuffed with cream cheese, panko-crusted',
  'M024': 'Crispy sweet potato fries with maple aioli',
  'M025': 'Mixed greens, cucumber, tomato & house vinaigrette',
  'M030': 'Crisp romaine, parmesan, croutons & creamy Caesar dressing',
  'M031': 'Mixed greens, cucumber, tomato, red onion & balsamic',
  'M032': 'Romaine, bacon, blue cheese, egg, avocado, tomato & chicken',
  'M033': 'Romaine, feta, olives, cucumber, tomato, red onion & oregano',
  'M040': 'Coca-Cola, Diet Coke, Sprite, Dr Pepper, Lemonade — free refills',
  'M041': 'Spring water, 16.9 fl oz',
  'M042': 'Fresh-squeezed Meyer lemons, real cane sugar',
  'M043': 'House-brewed unsweetened or sweet tea',
  'M044': 'Sparkling mineral water, 12 oz',
  'M050': 'Vanilla shake blended with white chocolate & fresh strawberries',
  'M051': 'Vanilla shake blended with milk chocolate & fresh strawberries',
  'M052': 'Vanilla shake blended with dark chocolate ganache & strawberries',
  'M053': 'Vanilla shake with crushed sandwich cookies, topped with whipped cream',
  'M060': 'Spiced chai blend with steamed milk & a touch of honey',
  'M061': 'Espresso topped with steamed milk foam, dusted with cocoa',
  'M062': 'Double shot of our house espresso blend',
  'M063': 'Rich Belgian hot cocoa with whipped cream & marshmallows',
  'M064': 'Espresso with steamed milk, topped with a light foam layer',
  'M070': 'Espresso & vanilla syrup over ice with cold milk',
  'M071': 'Hand-spun vanilla bean milkshake topped with whipped cream',
  'M072': 'Iced espresso with vanilla syrup & caramel drizzle',
  'M073': 'Ceremonial-grade matcha whisked with milk over ice',
  'M074': 'Double shot of espresso over ice with a splash of water',
  'M080': 'Espresso-soaked ladyfingers, mascarpone cream & cocoa dust',
  'M081': 'New York-style cheesecake on a graham cracker crust',
  'M082': 'Warm fudge brownie, vanilla ice cream, hot fudge & whipped cream'
};

// Modifier groups library — reusable groups attached to items
const ITEM_MOD_GROUPS = {
  'make-meal':       { name: 'Make it a meal', required: false, multi: true, options: [
    { name: 'Fries & Soda',           price: 4.00 },
    { name: 'Jalapeno Poppers add ons', price: 0.89 }
  ]},
  'patties':         { name: 'Patties', required: true, multi: false, options: [
    { name: 'Single Patty', price: 0 },
    { name: 'Double Patty', price: 3.00 },
    { name: 'Triple Patty', price: 5.50 }
  ]},
  'cheese':          { name: 'Cheese', required: false, multi: false, options: [
    { name: 'American', price: 0 }, { name: 'Cheddar', price: 0 }, { name: 'Provolone', price: 0 },
    { name: 'Swiss', price: 0 }, { name: 'Pepper Jack', price: 0.50 }, { name: 'No Cheese', price: 0 }
  ]},
  'doneness':        { name: 'Cook Temperature', required: true, multi: false, options: [
    { name: 'Medium Rare', price: 0 }, { name: 'Medium', price: 0 },
    { name: 'Medium Well', price: 0 }, { name: 'Well Done', price: 0 }
  ]},
  'burger-toppings': { name: 'Toppings', required: false, multi: true, options: [
    { name: 'Lettuce', price: 0 }, { name: 'Tomato', price: 0 }, { name: 'Red Onion', price: 0 },
    { name: 'Pickles', price: 0 }, { name: 'Bacon', price: 1.50 }, { name: 'Avocado', price: 1.50 },
    { name: 'Fried Egg', price: 1.25 }, { name: 'Jalapeños', price: 0.50 }
  ]},
  'bread':           { name: 'Bread', required: true, multi: false, options: [
    { name: 'Hoagie Roll', price: 0 }, { name: 'Brioche', price: 0.50 },
    { name: 'Sourdough', price: 0 }, { name: 'Whole Wheat', price: 0 }, { name: 'Lettuce Wrap', price: 0 }
  ]},
  'sandwich-toppings':{ name: 'Add-Ons', required: false, multi: true, options: [
    { name: 'Extra Cheese', price: 1.00 }, { name: 'Bacon', price: 1.50 },
    { name: 'Avocado', price: 1.50 }, { name: 'Mushrooms', price: 1.00 },
    { name: 'Sautéed Peppers', price: 1.00 }, { name: 'Hot Peppers', price: 0.50 }
  ]},
  'tender-pcs':      { name: 'Pieces', required: true, multi: false, options: [
    { name: '3 pcs', price: 0 }, { name: '5 pcs', price: 2.50 },
    { name: '8 pcs', price: 5.00 }, { name: '12 pcs', price: 8.50 }
  ]},
  'sauces':          { name: 'Sauces', required: false, multi: true, options: [
    { name: 'Ranch', price: 0 }, { name: 'BBQ', price: 0 }, { name: 'Honey Mustard', price: 0 },
    { name: 'Buffalo', price: 0 }, { name: 'Garlic Aioli', price: 0 },
    { name: 'House Sauce', price: 0 }, { name: 'Extra Sauce', price: 0.50 }
  ]},
  'wrap-style':      { name: 'Wrap Style', required: true, multi: false, options: [
    { name: 'Flour Tortilla', price: 0 }, { name: 'Whole Wheat', price: 0 },
    { name: 'Spinach', price: 0 }, { name: 'Sun-Dried Tomato', price: 0 }
  ]},
  'fries-style':     { name: 'Style', required: false, multi: false, options: [
    { name: 'Regular', price: 0 }, { name: 'Waffle', price: 0.50 },
    { name: 'Curly', price: 0.50 }, { name: 'Cajun Spice', price: 0.50 }
  ]},
  'side-size':       { name: 'Size', required: true, multi: false, options: [
    { name: 'Small', price: 0 }, { name: 'Medium', price: 1.50 }, { name: 'Large', price: 2.50 }
  ]},
  'salad-protein':   { name: 'Add Protein', required: false, multi: false, options: [
    { name: 'No Protein', price: 0 }, { name: 'Grilled Chicken', price: 3.50 },
    { name: 'Crispy Chicken', price: 3.50 }, { name: 'Shrimp', price: 5.00 },
    { name: 'Steak', price: 6.00 }, { name: 'Salmon', price: 6.50 }
  ]},
  'salad-dressing':  { name: 'Dressing', required: true, multi: false, options: [
    { name: 'Ranch', price: 0 }, { name: 'Caesar', price: 0 }, { name: 'Balsamic', price: 0 },
    { name: 'Italian', price: 0 }, { name: 'Blue Cheese', price: 0 },
    { name: 'Honey Mustard', price: 0 }, { name: 'Vinaigrette', price: 0 }, { name: 'On the Side', price: 0 }
  ]},
  'drink-size':      { name: 'Size', required: true, multi: false, options: [
    { name: 'Small (16 oz)', price: 0 }, { name: 'Medium (20 oz)', price: 0.75 }, { name: 'Large (24 oz)', price: 1.50 }
  ]},
  'soda-flavor':     { name: 'Flavor', required: true, multi: false, options: [
    { name: 'Coca-Cola', price: 0 }, { name: 'Diet Coke', price: 0 },
    { name: 'Sprite', price: 0 }, { name: 'Dr Pepper', price: 0 },
    { name: 'Root Beer', price: 0 }, { name: 'Lemonade', price: 0 }
  ]},
  'tea-style':       { name: 'Style', required: true, multi: false, options: [
    { name: 'Unsweetened', price: 0 }, { name: 'Sweet', price: 0 },
    { name: 'Half & Half', price: 0 }, { name: 'Peach', price: 0.50 }, { name: 'Raspberry', price: 0.50 }
  ]},
  'ice':             { name: 'Ice', required: false, multi: false, options: [
    { name: 'Regular Ice', price: 0 }, { name: 'Light Ice', price: 0 },
    { name: 'No Ice', price: 0 }, { name: 'Extra Ice', price: 0 }
  ]},
  'shake-size':      { name: 'Size', required: true, multi: false, options: [
    { name: 'Regular (16 oz)', price: 0 }, { name: 'Large (24 oz)', price: 2.00 }
  ]},
  'shake-toppings':  { name: 'Toppings', required: false, multi: true, options: [
    { name: 'Whipped Cream', price: 0 }, { name: 'Sprinkles', price: 0.50 },
    { name: 'Cherry on Top', price: 0.25 }, { name: 'Crushed Cookies', price: 1.00 },
    { name: 'Caramel Drizzle', price: 0.50 }, { name: 'Chocolate Drizzle', price: 0.50 },
    { name: 'Extra Strawberries', price: 1.00 }
  ]},
  'coffee-size':     { name: 'Size', required: true, multi: false, options: [
    { name: 'Short (8 oz)', price: 0 }, { name: 'Tall (12 oz)', price: 0.50 },
    { name: 'Grande (16 oz)', price: 1.00 }, { name: 'Venti (20 oz)', price: 1.50 }
  ]},
  'milk':            { name: 'Milk', required: true, multi: false, options: [
    { name: 'Whole Milk', price: 0 }, { name: '2% Milk', price: 0 }, { name: 'Skim Milk', price: 0 },
    { name: 'Oat Milk', price: 0.75 }, { name: 'Almond Milk', price: 0.75 },
    { name: 'Soy Milk', price: 0.75 }, { name: 'Coconut Milk', price: 0.75 }
  ]},
  'espresso-shots':  { name: 'Espresso Shots', required: false, multi: false, options: [
    { name: 'Standard', price: 0 }, { name: 'Extra Shot', price: 1.00 },
    { name: 'Double Shot', price: 2.00 }, { name: 'Decaf', price: 0 }
  ]},
  'sweetness':       { name: 'Sweetness', required: false, multi: false, options: [
    { name: 'Regular', price: 0 }, { name: 'Light', price: 0 },
    { name: 'Extra', price: 0 }, { name: 'Sugar-Free', price: 0 }, { name: 'No Sugar', price: 0 }
  ]},
  'flavor-syrup':    { name: 'Flavor Syrup', required: false, multi: true, options: [
    { name: 'Vanilla', price: 0.50 }, { name: 'Caramel', price: 0.50 },
    { name: 'Hazelnut', price: 0.50 }, { name: 'Mocha', price: 0.50 },
    { name: 'Cinnamon', price: 0.50 }, { name: 'Pumpkin Spice', price: 0.75 }
  ]},
  'tender-style':    { name: 'Style', required: false, multi: false, options: [
    { name: 'Original', price: 0 }, { name: 'Buffalo', price: 0 },
    { name: 'Honey BBQ', price: 0 }, { name: 'Nashville Hot', price: 0.50 }, { name: 'Korean BBQ', price: 0.50 }
  ]},
  'dessert-extras':  { name: 'Add-Ons', required: false, multi: true, options: [
    { name: 'Ice Cream Scoop', price: 1.50 }, { name: 'Whipped Cream', price: 0 },
    { name: 'Hot Fudge', price: 0.75 }, { name: 'Caramel', price: 0.75 }, { name: 'Fresh Berries', price: 1.50 }
  ]}
};

// Map menu item IDs → list of modifier group keys that apply
const ITEM_MODIFIERS = {
  'M010': ['make-meal', 'patties', 'cheese', 'doneness', 'burger-toppings'],
  'M011': ['make-meal', 'cheese', 'doneness', 'burger-toppings'],
  'M012': ['make-meal', 'cheese', 'doneness', 'burger-toppings'],
  'M013': ['make-meal', 'cheese', 'doneness', 'burger-toppings'],
  'M014': ['make-meal', 'cheese', 'burger-toppings'],
  'M001': ['make-meal', 'bread', 'cheese', 'sandwich-toppings'],
  'M002': ['tender-pcs', 'tender-style', 'sauces'],
  'M003': ['make-meal', 'bread', 'sandwich-toppings', 'sauces'],
  'M004': ['side-size', 'sauces'],
  'M005': ['tender-style', 'sauces'],
  'M006': ['wrap-style', 'sandwich-toppings', 'sauces'],
  'M007': ['bread', 'sandwich-toppings'],
  'M008': ['bread', 'sandwich-toppings'],
  'M020': ['side-size', 'fries-style', 'sauces'],
  'M021': ['side-size', 'sauces'],
  'M022': ['side-size', 'sauces'],
  'M023': ['side-size', 'sauces'],
  'M024': ['side-size', 'sauces'],
  'M025': ['salad-dressing'],
  'M030': ['salad-protein', 'salad-dressing'],
  'M031': ['salad-protein', 'salad-dressing'],
  'M032': ['salad-protein', 'salad-dressing'],
  'M033': ['salad-protein', 'salad-dressing'],
  'M040': ['drink-size', 'soda-flavor', 'ice'],
  'M041': [],
  'M042': ['drink-size', 'ice'],
  'M043': ['drink-size', 'tea-style', 'ice'],
  'M044': [],
  'M050': ['shake-size', 'shake-toppings'],
  'M051': ['shake-size', 'shake-toppings'],
  'M052': ['shake-size', 'shake-toppings'],
  'M053': ['shake-size', 'shake-toppings'],
  'M060': ['coffee-size', 'milk', 'sweetness'],
  'M061': ['coffee-size', 'milk', 'espresso-shots', 'flavor-syrup'],
  'M062': ['espresso-shots', 'sweetness'],
  'M063': ['coffee-size', 'milk', 'flavor-syrup'],
  'M064': ['coffee-size', 'milk', 'espresso-shots', 'flavor-syrup'],
  'M070': ['coffee-size', 'milk', 'espresso-shots', 'sweetness', 'ice'],
  'M071': ['shake-size', 'shake-toppings'],
  'M072': ['coffee-size', 'milk', 'espresso-shots', 'ice'],
  'M073': ['coffee-size', 'milk', 'sweetness', 'ice'],
  'M074': ['coffee-size', 'espresso-shots', 'ice'],
  'M080': ['dessert-extras'],
  'M081': ['dessert-extras'],
  'M082': ['dessert-extras']
};

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
  // Screenshot matches (Image 4, 7, 11)
  { id: 'I000', name: 'Burger',           sku: 'BRG-001', category: 'Uncategorized', cost: 2.50, unit: 'pcs', onHand: 10, max: 30, threshold: 5,  vendor: 'Pat Lafrieda', recipe: false },
  { id: 'I001', name: 'Burger Patty 12oz', sku: 'BRG-12OZ', category: 'Frozen',       cost: 2.46, unit: 'pcs', onHand: 0,  max: 50, threshold: 0,  vendor: 'Pat Lafrieda', recipe: true },
  { id: 'I002', name: 'Chicken Patty',     sku: 'CHK-PATTY',category: 'Proteins',     cost: 1.88, unit: 'pcs', onHand: 0,  max: 40, threshold: 20, vendor: null,           recipe: true },
  // Pantry / extended catalog (kept for full functionality)
  { id: 'I003', name: 'Ribeye Steak',       sku: 'RIB-08OZ', category: 'Proteins',     cost: 8.42, unit: 'lb',  onHand: 42, max: 50, threshold: 8,  vendor: 'Pat Lafrieda', recipe: true },
  { id: 'I004', name: 'Chicken Breast',     sku: 'CHK-BREAST',category:'Proteins',     cost: 3.18, unit: 'lb',  onHand: 68, max: 75, threshold: 15, vendor: 'Pat Lafrieda', recipe: true },
  { id: 'I005', name: 'Brioche Buns',       sku: 'BUN-BRIOCHE',category:'Bakery',      cost: 0.42, unit: 'ea',  onHand: 24, max: 100,threshold: 20, vendor: 'Riverview Bakery', recipe: true },
  { id: 'I006', name: 'Russet Potatoes',    sku: 'POT-RUSSET',category: 'Produce',     cost: 0.62, unit: 'lb',  onHand: 87, max: 115,threshold: 25, vendor: 'Oakwood Produce', recipe: true },
  { id: 'I007', name: 'Provolone Cheese',   sku: 'CHS-PROV', category: 'Dairy',        cost: 5.20, unit: 'lb',  onHand: 8,  max: 40, threshold: 12, vendor: 'Northgate Dairy', recipe: true },
  { id: 'I008', name: 'Whole Milk',         sku: 'MLK-WHL',  category: 'Dairy',        cost: 3.84, unit: 'gal', onHand: 0,  max: 12, threshold: 4,  vendor: 'Northgate Dairy', recipe: true },
  { id: 'I009', name: 'Sourdough Loaves',   sku: 'BR-SOUR',  category: 'Bakery',       cost: 3.50, unit: 'ea',  onHand: 18, max: 28, threshold: 6,  vendor: 'Riverview Bakery', recipe: true },
  { id: 'I010', name: 'Espresso Beans',     sku: 'COF-ESP',  category: 'Beverage',     cost: 14.20,unit: 'lb',  onHand: 12, max: 20, threshold: 4,  vendor: 'Cascade Roasters', recipe: true },
  { id: 'I011', name: 'Strawberries',       sku: 'FR-STR',   category: 'Produce',      cost: 4.20, unit: 'lb',  onHand: 6,  max: 22, threshold: 8,  vendor: 'Oakwood Produce', recipe: true },
  { id: 'I012', name: 'Romaine Lettuce',    sku: 'VEG-ROM',  category: 'Produce',      cost: 1.80, unit: 'head',onHand: 32, max: 40, threshold: 8,  vendor: 'Oakwood Produce', recipe: true },
  { id: 'I013', name: 'Tomatoes',           sku: 'VEG-TOM',  category: 'Produce',      cost: 2.40, unit: 'lb',  onHand: 18, max: 30, threshold: 6,  vendor: 'Oakwood Produce', recipe: true },
  { id: 'I014', name: 'Bacon (thick)',      sku: 'PRK-BAC',  category: 'Proteins',     cost: 6.80, unit: 'lb',  onHand: 14, max: 20, threshold: 4,  vendor: 'Pat Lafrieda', recipe: true },
  { id: 'I015', name: 'Sliced Pickles',     sku: 'CON-PCK',  category: 'Pantry',       cost: 2.80, unit: 'jar', onHand: 9,  max: 12, threshold: 3,  vendor: 'Stonebridge Foods', recipe: false },
  { id: 'I016', name: 'Ketchup (gallon)',   sku: 'CON-KCH',  category: 'Pantry',       cost: 11.40,unit: 'gal', onHand: 6,  max: 8,  threshold: 2,  vendor: 'Stonebridge Foods', recipe: false }
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
  { id: '#S5-0001', time: 6209.17, mode: 'TO GO', items: [
    { qty: 3, station: null, name: 'CHEESESTEAK SANDWICH', mods: ['+ Make it a meal: Jalapeno Poppers add ons'], served: false },
    { qty: 1, station: null, name: 'Fried Corn ( Cobettes )',     mods: ['+ 3 pcs'], served: true },
    { qty: 1, station: null, name: 'JALAPEÑO POPPERS',              mods: ['+ Jalapeno Poppers pcs: 8 pcs'], served: true }
  ]},
  { id: '#S5-0001b', time: 4511.25, mode: 'DINE IN', table: 'Table 1', items: [
    { qty: 1, station: 'S2', name: 'CHEESESTEAK SANDWICH', mods: ['+ Make it a meal: Jalapeno Poppers add ons'], served: false },
    { qty: 4, station: null, name: 'Fries',                  mods: ['+ Waffle'], served: false },
    { qty: 1, station: 'S4', name: 'Iced Latte',             mods: ['+ Milk Options: Oat Milk', '+ Shots of Espresso: Extra Shot'], served: true },
    { qty: 2, station: 'S3', name: 'White Chocolate Strawberry Cup', mods: [], served: false }
  ]},
  { id: '#S1-0001', time: 11.22, mode: 'TO GO', items: [{ qty: 1, station: null, name: 'Crispy Chicken Sandwich', mods: [], served: false }] },
  { id: '#S4-0001', time: 5.48, mode: 'TO GO', items: [{ qty: 1, station: null, name: 'Crispy Chicken Sandwich', mods: ['+ Make it a meal: Jalapeño Poppers'], served: false }] },
  { id: '#S4-0002', time: 5.35, mode: 'TO GO', items: [{ qty: 1, station: null, name: 'Crispy Chicken Sandwich', mods: [], served: false }] },
  { id: '#S4-0003', time: 5.21, mode: 'TO GO', items: [{ qty: 1, station: null, name: 'Cheesesteak Sandwich', mods: [], served: false }] },
  { id: '#S5-0002', time: 4.42, mode: 'TO GO', items: [
    { qty: 1, station: null, name: 'Cheesesteak Sandwich', mods: ['+ Fries & Soda', '+ Extra Pickles'], served: false },
    { qty: 1, station: null, name: 'Milk Choc Strawberry', mods: [], served: false },
    { qty: 2, station: null, name: 'White Choc Strawberry', mods: [], served: false }
  ]},
  { id: '#S5-0003', time: 4.38, mode: 'TO GO', items: [{ qty: 2, station: null, name: 'Cheesesteak Sandwich', mods: ['+ Fries & Soda'], served: false }] },
  { id: '#S5-0006', time: 4.28, mode: 'TO GO', items: [
    { qty: 1, station: null, name: 'Cheesesteak Sandwich', mods: ['+ Jalapeño Poppers'], served: false },
    { qty: 1, station: null, name: 'Smash Burger', mods: ['+ 1 Patty'], served: false }
  ]},
  { id: '#S5-0007', time: 4.25, mode: 'TO GO', items: [{ qty: 2, station: null, name: 'Crispy Chicken Sandwich', mods: ['+ Fries & Soda'], served: false }] },
  { id: '#S5-0011', time: 4.14, mode: 'TO GO', items: [
    { qty: 2, station: null, name: 'Cheesesteak Sandwich', mods: ['+ Jalapeño Poppers', '× Fries & Soda'], served: false },
    { qty: 1, station: null, name: 'Chicken Tenders', mods: ['+ 8 pcs'], served: false }
  ]},
  { id: '#S5-0008', time: 2.42, mode: 'TO GO', items: [{ qty: 1, station: null, name: 'Loaded Fries', mods: ['+ Half & Half'], served: false }] },
  { id: '#S1-0002', time: 1.58, mode: 'TO GO', items: [{ qty: 1, station: null, name: 'Cheesesteak Sandwich', mods: [], served: false }] }
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
  business: { name: 'Maple & Vine', location: '218 Oak Street', tz: 'Eastern Time (US & Canada)', currency: 'USD ($)' },
  ops: { cashDiscount: true, tipPrompts: true, allergenFlags: true, autoPrint: true, managerPin: true, offline: true, customerDisplay: false },
  notif: { lowStock: true, suspicious: true, dailyEmail: true, soundEnabled: true, vibration: false, newOrder: true, orderReady: true,
    sounds: { online: 'Bell', kiosk: 'Ding', thirdParty: 'Alert' }
  },
  payments: { card: true, cash: true, mobile: true, gift: false },
  tax: { rate: 8.88 },

  // ─── Operations & Hardware new panes ───
  devices: {
    stations: [
      { id: 'st-front',  name: 'Front Counter',           type: 'Register', code: '#1', drawer: null, hardware: 'No hardware', connected: false },
      { id: 'st-kds2',   name: 'KDS 2',                    type: 'Kds',      code: '#3', drawer: null, hardware: 'No hardware', connected: false },
      { id: 'st-samir',  name: "Samir's Tablet",           type: 'Register', code: '#4', drawer: null, hardware: null,           connected: true, active: true },
      { id: 'st-temur',  name: 'Temur Production Station', type: 'Register', code: '#5', drawer: 'Temur Prod Drawer', hardware: 'No hardware', connected: true }
    ]
  },
  printKds: {
    receipt: { merchantCopy: false, customerCopy: true, taxBreakdown: true, itemizedList: true, tipOptions: true, footer: 'Thank you for dining with us!' },
    kitchen: { autoFire: true, includeModifiers: true, groupByStation: true, printTimer: false }
  },
  receiptTpl: {
    activeTab: 'sale',
    branding: { headerText: '', footerText: '', showLogo: false },
    content: { showModifiers: true, showTax: true, showTip: true, showBarcode: false }
  },
  cashMgmt: {
    requireCount: true,
    blindCount: false,
    floatAmount: 200,
    noSaleRequiresApproval: true,
    overShortAlert: 5.00
  },
  fraud: {
    refundSelfGuard: false,
    velocityThreshold: 3,
    pinAfter: 2,
    lockAfter: 3,
    resetMinutes: 60
  },
  diningRoom: {
    floorPlans: [
      { id: 'party',  name: 'Party room',        tables: 17 },
      { id: 'saucy',  name: 'Garden Hall', tables: 27 }
    ],
    defaultParty: 2,
    sittingMinutes: 60,
    allowMerging: true,
    autoAssignServer: false,
    showCovers: true
  },
  customerDisplay: {
    connected: false,
    showRightPanel: true,
    rightPanelLayout: 'single',     // 'single' | 'stacked'
    idleCarousel: ['Standard On'],
    primarySlot: null,
    crop: '9:16'
  },
  orderLine: {
    visibility: 'today',             // 'today' | '2d' | '3d' | '7d' | '14d' | '30d'
    view: 'cards',
    sortBy: 'newest',
    autoArchive: true
  }
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
  settingsPane: 'devices'
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
  if (name === 'vendors') renderVendors();
  if (name === 'scheduling') renderScheduling();
  if (name === 'settings') renderSettings();
  if (name === 'loyalty') renderLoyalty();
}

/* ─── MODAL ──────────────────────────────────────────────────────── */

let lastFocused = null;

function openModal(html, wide) {
  lastFocused = document.activeElement;
  $('#modalContent').innerHTML = html;
  $('#modal').classList.add('show');
  $('#modalContent').classList.toggle('modal-wide', !!wide);
  setTimeout(() => {
    const f = $('#modalContent input, #modalContent textarea, #modalContent .btn-primary');
    if (f) f.focus();
  }, 50);
}
function closeModal() {
  $('#modal').classList.remove('show');
  $('#modalContent').classList.remove('modal-wide');
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
window.closeModal = closeModal;

$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#modal').classList.contains('show')) closeModal();
});

/* ─── HOME ───────────────────────────────────────────────────────── */

const HOME_TILES = [
  // Operations row (5 tiles)
  { id: 'sales',     name: 'Sales',           section: 'ops', icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>' },
  { id: 'tables',    name: 'Tables',          section: 'ops', icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
  { id: 'orders',    name: 'Previous Orders', section: 'ops', icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>' },
  { id: 'kitchen',   name: 'Kitchen Display', section: 'ops', icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6"/><path d="M18 14a3 3 0 0 0 1.5-5.6A3.5 3.5 0 0 0 16 4a4 4 0 0 0-8 0 3.5 3.5 0 0 0-3.5 4.4A3 3 0 0 0 6 14h12z"/><path d="M6 17h12"/></svg>' },
  { id: 'loyalty',   name: 'Loyalty',         section: 'ops', icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/></svg>' },

  // Management row (4 tiles — locked, manager-only)
  // Note: Vendors lives inside Menu Management's left-nav. Scheduling lives inside Settings (Staff & Roles area). Both fully accessible.
  { id: 'menu-mgmt', name: 'Menu Management', section: 'mgmt', locked: true, icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg>' },
  { id: 'inventory', name: 'Inventory',       section: 'mgmt', locked: true, icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>' },
  { id: 'analytics', name: 'Analytics',       section: 'mgmt', locked: true, icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20h18"/><rect x="5" y="10" width="3" height="10"/><rect x="11" y="6" width="3" height="14"/><rect x="17" y="13" width="3" height="7"/></svg>' },
  { id: 'settings',  name: 'Settings',        section: 'mgmt', locked: true, icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' }
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
    <button class="home-tile ${t.locked ? 'locked' : ''}" data-goto="${t.id}" aria-label="${t.name}">
      ${t.locked ? '<svg class="home-tile-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : ''}
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
    const imgHtml = m.img
      ? `<div class="menu-card-image" style="background-image: url('${m.img}'); background-size: cover; background-position: center; background-color: #F1F5F9;" aria-hidden="true"></div>`
      : `<div class="menu-card-image menu-card-image-placeholder" aria-hidden="true">
           <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="color:var(--slate-400);"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
         </div>`;
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
  const orderlineNum = $('#orderlinePillNum');
  if (orderlineNum) orderlineNum.textContent = '#' + formatOrderNum();
  $('#payBtn').disabled = state.currentOrder.length === 0;
  $('#sendBtn').disabled = state.currentOrder.length === 0;

  if (state.currentOrder.length === 0) {
    $('#orderEmpty').style.display = 'flex';
    $('#orderList').innerHTML = '';
  } else {
    $('#orderEmpty').style.display = 'none';
    $('#orderList').innerHTML = state.currentOrder.map((it, idx) => {
      const isEditing = detailState && detailState.editIdx === idx;
      return `
        <div class="order-line order-line-v2 ${isEditing ? 'editing' : ''}" role="listitem" data-line-idx="${idx}">
          <span class="order-line-num-badge">${idx + 1}</span>
          <div class="order-line-info">
            <div class="order-line-name">${escapeHtml(it.name)}</div>
            ${it.mods && it.mods.length ? `<div class="order-line-mods-v2">${it.mods.map(escapeHtml).join(' · ')}</div>` : ''}
          </div>
          <div class="order-line-actions">
            <div class="order-line-price">${fmt(it.price * it.qty)}</div>
            <div class="qty-control" role="group" aria-label="${escapeHtml(it.name)} quantity">
              <button class="qty-btn" data-act="dec" data-idx="${idx}" aria-label="Decrease">−</button>
              <span class="qty-num" aria-live="polite">${it.qty}</span>
              <button class="qty-btn" data-act="inc" data-idx="${idx}" aria-label="Increase">+</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    // Click line (not on qty buttons) to re-open detail
    $$('.order-line-v2').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.qty-control')) return;
        const idx = parseInt(el.dataset.lineIdx);
        const it = state.currentOrder[idx];
        if (!it) return;
        const groupKeys = ITEM_MODIFIERS[it.id] || [];
        if (groupKeys.length === 0) return;
        openProductDetail(it.id, idx);
      });
    });
  }
}

function addItemToOrder(menuId) {
  const m = MENU_ITEMS.find(x => x.id === menuId);
  if (!m) return;
  if (m.stock === 'out') { toast(m.name + ' is out of stock', true); return; }
  const groupKeys = ITEM_MODIFIERS[m.id] || [];
  if (groupKeys.length === 0) {
    // No modifiers — fast path, add directly
    const existing = state.currentOrder.find(i => i.id === m.id && (!i.mods || i.mods.length === 0));
    if (existing) existing.qty += 1;
    else state.currentOrder.push({ id: m.id, name: m.name, price: m.price, cashPrice: m.cash, qty: 1, mods: [] });
    recalcOrder();
    toast(m.name + ' added');
  } else {
    openProductDetail(menuId);
  }
}

/* ─── PRODUCT DETAIL PANEL ──────────────────────────────────────── */

// Current detail state — selections per group
let detailState = null;

function openProductDetail(menuId, editIdx = null) {
  const m = MENU_ITEMS.find(x => x.id === menuId);
  if (!m) return;
  const groupKeys = ITEM_MODIFIERS[m.id] || [];

  // If editing an existing order line, prime the selections
  let priming = null;
  if (editIdx !== null && state.currentOrder[editIdx]) {
    priming = state.currentOrder[editIdx];
  }

  // Defaults — pick first option for required groups
  const selections = {};
  groupKeys.forEach(gk => {
    const g = ITEM_MOD_GROUPS[gk];
    if (!g) return;
    if (priming && priming.modSelections && priming.modSelections[gk]) {
      selections[gk] = priming.modSelections[gk];
    } else if (g.required && g.options.length > 0) {
      // Default to first option
      selections[gk] = g.multi ? [g.options[0].name] : g.options[0].name;
    } else {
      selections[gk] = g.multi ? [] : null;
    }
  });

  detailState = {
    menuId, editIdx,
    activeGroup: groupKeys[0] || null,
    selections,
    qty: priming ? priming.qty : 1,
    specialInstructions: priming ? (priming.specialInstructions || '') : '',
    customMods: priming && priming.customMods ? [...priming.customMods] : []
  };
  state.detailMenuId = menuId;  // for cart highlighting
  // Hide menu chrome (search row, orderline row, category tabs)
  $$('.menu-col .sales-menu-top, .menu-col .sales-orderline-row, .menu-col .sales-cat-row').forEach(el => {
    el.style.display = 'none';
  });
  renderProductDetail();
}

function calcDetailPrice() {
  const m = MENU_ITEMS.find(x => x.id === detailState.menuId);
  let total = m.price;
  const groupKeys = ITEM_MODIFIERS[m.id] || [];
  for (const gk of groupKeys) {
    const g = ITEM_MOD_GROUPS[gk];
    if (!g) continue;
    const sel = detailState.selections[gk];
    if (g.multi) {
      (sel || []).forEach(name => {
        const opt = g.options.find(o => o.name === name);
        if (opt) total += opt.price;
      });
    } else if (sel) {
      const opt = g.options.find(o => o.name === sel);
      if (opt) total += opt.price;
    }
  }
  // Custom mods
  (detailState.customMods || []).forEach(c => { total += (c.price || 0); });
  return total * detailState.qty;
}

function renderProductDetail() {
  const m = MENU_ITEMS.find(x => x.id === detailState.menuId);
  if (!m) return;
  const groupKeys = ITEM_MODIFIERS[m.id] || [];
  const desc = ITEM_DESCRIPTIONS[m.id] || '';

  // Build group tabs
  const tabsHtml = groupKeys.map(gk => {
    const g = ITEM_MOD_GROUPS[gk];
    if (!g) return '';
    const sel = detailState.selections[gk];
    const hasSelection = g.multi ? (sel && sel.length > 0) : !!sel;
    const isActive = detailState.activeGroup === gk;
    return `<button class="pd-tab ${isActive ? 'active' : ''}" data-pd-tab="${gk}">
      ${escapeHtml(g.name)}
      ${hasSelection ? '<span class="pd-tab-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></span>' : ''}
    </button>`;
  }).join('') + `<button class="pd-tab pd-tab-custom" id="pdCustomBtn">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
    Custom Modifier
  </button>`;

  // Active group body
  const ag = detailState.activeGroup ? ITEM_MOD_GROUPS[detailState.activeGroup] : null;
  let groupBody = '';
  if (ag) {
    const sel = detailState.selections[detailState.activeGroup];
    const meta = `${ag.required ? 'Required' : 'Optional'} · ${ag.multi ? 'Multi Select' : 'Single Select'}`;
    groupBody = `
      <div class="pd-group-head">
        <h4 class="pd-group-title">${escapeHtml(ag.name)}</h4>
        <span class="pd-group-meta">${meta}</span>
      </div>
      <div class="pd-options">
        ${ag.options.map(o => {
          const selected = ag.multi ? (sel || []).includes(o.name) : sel === o.name;
          return `<button class="pd-option ${selected ? 'selected' : ''}" data-pd-opt="${escapeHtml(o.name)}">
            <span class="pd-option-name">${escapeHtml(o.name)}</span>
            ${o.price > 0 ? `<span class="pd-option-price">+$${o.price.toFixed(2)}</span>` : (o.price < 0 ? `<span class="pd-option-price neg">-$${Math.abs(o.price).toFixed(2)}</span>` : '')}
          </button>`;
        }).join('')}
      </div>
    `;
  } else if (detailState.customMods.length === 0 && groupKeys.length === 0) {
    groupBody = '<div class="pd-empty">No modifiers for this item.</div>';
  }

  // Custom modifiers list
  let customHtml = '';
  if (detailState.customMods.length > 0) {
    customHtml = `
      <div class="pd-custom-list">
        <div class="pd-group-head"><h4 class="pd-group-title">Custom Modifiers</h4></div>
        ${detailState.customMods.map((c, i) => `
          <div class="pd-custom-chip">
            <span>${escapeHtml(c.name)}${c.price ? ` (+$${c.price.toFixed(2)})` : ''}</span>
            <button class="pd-custom-x" data-pd-rmcustom="${i}" aria-label="Remove">&times;</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  const doneLabel = detailState.editIdx !== null ? 'Update · ' + fmt(calcDetailPrice()) : 'Done · ' + fmt(calcDetailPrice());

  $('#menuGridContainer').innerHTML = `
    <div class="product-detail">
      <div class="pd-top">
        <button class="pd-back" id="pdBack">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          Menu
        </button>
        <div class="pd-top-actions">
          <button class="pd-close" id="pdClose" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <button class="pd-done" id="pdDone">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
            ${doneLabel}
          </button>
        </div>
      </div>

      <div class="pd-header">
        <div class="pd-thumb" style="background-image: url('${m.img || ''}');">
          ${m.img ? '' : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="color:var(--slate-400);"><path d="M3 11l18-5v12L3 14v-3z"/></svg>'}
        </div>
        <div class="pd-header-info">
          <h3 class="pd-name">${escapeHtml(m.name)}</h3>
          <p class="pd-desc">${escapeHtml(desc)}</p>
        </div>
        <div class="pd-price">${fmt(m.price)}</div>
      </div>

      <div class="pd-tabs">${tabsHtml}</div>

      <div class="pd-body" id="pdBody">
        ${groupBody}
        ${customHtml}
      </div>

      <div class="pd-foot">
        <div class="pd-qty-row">
          <span class="pd-qty-label">Quantity</span>
          <div class="pd-qty-control">
            <button class="pd-qty-btn" id="pdQtyDec" aria-label="Decrease">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>
            </button>
            <span class="pd-qty-num">${detailState.qty}</span>
            <button class="pd-qty-btn" id="pdQtyInc" aria-label="Increase">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        <div class="pd-special">
          <div class="pd-special-head">
            <span class="pd-special-label">Special Instructions</span>
            <span class="pd-special-count">${detailState.specialInstructions.length}/80</span>
          </div>
          <textarea class="pd-special-input" id="pdSpecial" maxlength="80" placeholder="No onions, extra sauce…">${escapeHtml(detailState.specialInstructions)}</textarea>
        </div>
      </div>
    </div>
  `;

  // Wire interactions
  $('#pdBack').onclick = closeProductDetail;
  $('#pdClose').onclick = closeProductDetail;
  $('#pdDone').onclick = commitProductDetail;
  $$('[data-pd-tab]').forEach(b => b.addEventListener('click', () => {
    detailState.activeGroup = b.dataset.pdTab;
    renderProductDetail();
  }));
  $$('[data-pd-opt]').forEach(b => b.addEventListener('click', () => {
    const opt = b.dataset.pdOpt;
    const g = ITEM_MOD_GROUPS[detailState.activeGroup];
    if (g.multi) {
      const cur = detailState.selections[detailState.activeGroup] || [];
      const idx = cur.indexOf(opt);
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(opt);
      detailState.selections[detailState.activeGroup] = cur;
    } else {
      detailState.selections[detailState.activeGroup] = (detailState.selections[detailState.activeGroup] === opt && !g.required) ? null : opt;
    }
    renderProductDetail();
  }));
  $$('[data-pd-rmcustom]').forEach(b => b.addEventListener('click', () => {
    detailState.customMods.splice(parseInt(b.dataset.pdRmcustom), 1);
    renderProductDetail();
  }));
  $('#pdQtyDec').onclick = () => { detailState.qty = Math.max(1, detailState.qty - 1); renderProductDetail(); };
  $('#pdQtyInc').onclick = () => { detailState.qty = Math.min(99, detailState.qty + 1); renderProductDetail(); };
  $('#pdSpecial').oninput = (e) => {
    detailState.specialInstructions = e.target.value;
    const counter = e.target.parentElement.querySelector('.pd-special-count');
    if (counter) counter.textContent = e.target.value.length + '/80';
  };
  $('#pdCustomBtn').onclick = openCustomModifierDialog;
}

function closeProductDetail() {
  detailState = null;
  state.detailMenuId = null;
  // Restore menu chrome
  $$('.menu-col .sales-menu-top, .menu-col .sales-orderline-row, .menu-col .sales-cat-row').forEach(el => {
    el.style.display = '';
  });
  renderMenuGridContainer();
  recalcOrder();  // refresh cart highlight
}

function commitProductDetail() {
  const m = MENU_ITEMS.find(x => x.id === detailState.menuId);
  const groupKeys = ITEM_MODIFIERS[m.id] || [];

  // Validate required groups
  for (const gk of groupKeys) {
    const g = ITEM_MOD_GROUPS[gk];
    if (g && g.required) {
      const sel = detailState.selections[gk];
      const ok = g.multi ? (sel && sel.length > 0) : !!sel;
      if (!ok) {
        detailState.activeGroup = gk;
        renderProductDetail();
        toast(`Please choose a ${g.name.toLowerCase()}`, true);
        return;
      }
    }
  }

  // Build mods array (for cart display) + selections (for later editing)
  const mods = [];
  const selectionsCopy = {};
  for (const gk of groupKeys) {
    const g = ITEM_MOD_GROUPS[gk];
    if (!g) continue;
    const sel = detailState.selections[gk];
    selectionsCopy[gk] = g.multi ? (sel ? [...sel] : []) : sel;
    if (g.multi) (sel || []).forEach(name => {
      const opt = g.options.find(o => o.name === name);
      if (opt) mods.push(opt.price !== 0 ? `${name} (${opt.price > 0 ? '+' : '-'}$${Math.abs(opt.price).toFixed(2)})` : name);
    });
    else if (sel) {
      const opt = g.options.find(o => o.name === sel);
      if (opt) mods.push(opt.price > 0 ? `${sel} (+$${opt.price.toFixed(2)})` : sel);
    }
  }
  detailState.customMods.forEach(c => {
    mods.push(c.price ? `${c.name} (+$${c.price.toFixed(2)})` : c.name);
  });
  if (detailState.specialInstructions) mods.push(`Note: ${detailState.specialInstructions}`);

  // Compute price per unit (calcDetailPrice multiplies by qty; we want per-unit)
  const pricePerUnit = calcDetailPrice() / detailState.qty;
  // cash price proportional
  const cashRatio = m.cash / m.price;
  const cashPerUnit = pricePerUnit * cashRatio;

  if (detailState.editIdx !== null && state.currentOrder[detailState.editIdx]) {
    state.currentOrder[detailState.editIdx] = {
      id: m.id, name: m.name, price: pricePerUnit, cashPrice: cashPerUnit,
      qty: detailState.qty, mods, modSelections: selectionsCopy,
      customMods: [...detailState.customMods],
      specialInstructions: detailState.specialInstructions
    };
    toast(`${m.name} updated`);
  } else {
    state.currentOrder.push({
      id: m.id, name: m.name, price: pricePerUnit, cashPrice: cashPerUnit,
      qty: detailState.qty, mods, modSelections: selectionsCopy,
      customMods: [...detailState.customMods],
      specialInstructions: detailState.specialInstructions
    });
    toast(`${m.name} added`);
  }
  closeProductDetail();
}

function openCustomModifierDialog() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Custom Modifier</h2><p class="modal-sub">Add a custom note or extra to this item.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="customModName">Name</label><input class="form-input" id="customModName" placeholder="e.g. Extra dressing on side"></div>
      <div class="form-group"><label class="form-label" for="customModPrice">Upcharge ($, optional)</label><input class="form-input" id="customModPrice" type="number" step="0.01" min="0" placeholder="0.00"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="addCustomMod()">Add</button>
    </div>
  `);
}
window.addCustomMod = function() {
  const name = $('#customModName').value.trim();
  const price = parseFloat($('#customModPrice').value) || 0;
  if (!name) { toast('Enter a name', true); return; }
  detailState.customMods.push({ name, price });
  closeModal();
  renderProductDetail();
};

function renderMenuGridContainer() {
  // Restore the menu grid (rebuild it from current state)
  $('#menuGridContainer').innerHTML = `<div class="menu-grid" id="menuGrid"></div>`;
  renderMenuGrid();
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
  $('#addCustomerLabel').textContent = 'Add Customer';
  const subEl = $('.add-customer-sub'); if (subEl) subEl.style.display = '';
  $('#addCustomerBtn').classList.remove('has-customer');
  $('#orderNoteLabel').textContent = 'Add order note…';
  $('#addNoteBtn').classList.remove('has-note');
  $$('.mode-btn').forEach(b => {
    const active = b.dataset.mode === 'dine-in';
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', active);
  });
  state.orderMode = 'dine-in';
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
    $('#addCustomerLabel').textContent = c.name;
    const subEl = $('.add-customer-sub'); if (subEl) subEl.textContent = `${c.points} pts`;
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
  $('#addCustomerLabel').textContent = 'Add Customer';
  const subEl = $('.add-customer-sub'); if (subEl) { subEl.textContent = 'Optional'; subEl.style.display = ''; }
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
  payMethod = 'card-reader';
  state.payTip = 0;
  state.payCardTotal = cardTotal;
  state.payCashTotal = cashTotal;
  renderPayStep1();
}

function renderPayStep1() {
  openModal(`
    <div class="pay-flow-head">
      <h2 class="pay-flow-title">Payment</h2>
      <button class="pay-flow-close" onclick="closeModal()">CLOSE</button>
    </div>
    <div class="pay-progress-row">
      <div class="pay-progress-label">SELECT METHOD</div>
      <div class="pay-progress-pct">10%</div>
    </div>
    <div class="pay-progress-track"><div class="pay-progress-fill" style="width:10%;"></div></div>
    <div class="pay-flow-body">
      <h3 class="pay-flow-h2">Select Payment Method</h3>
      <p class="pay-flow-sub">Choose how the customer would like to pay</p>
      <div class="pay-method-list" id="payMethodList">
        ${renderPayMethod('card-reader', 'Card Reader', 'Credit, Debit, or Corporate Cards', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/></svg>')}
        ${renderPayMethod('manual-key',  'Manual Key-in', 'Manually enter card details', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/></svg>')}
        ${renderPayMethod('split-bill',  'Split Bill',     'Split by amount, item, or evenly', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>')}
        ${renderPayMethod('cash',        'Cash',           'Standard cash transaction', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/></svg>')}
        ${renderPayMethod('open-tab',    'Open Tab',       'Pre-authorize and charge later', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>')}
      </div>
    </div>
    <div class="pay-flow-foot">
      <button class="pay-flow-cancel" onclick="closeModal()">Cancel</button>
      <button class="pay-flow-proceed" id="payProceedBtn" onclick="payStep1Proceed()">Proceed</button>
    </div>
  `, true);

  $$('[data-pay-method]').forEach(b => b.addEventListener('click', () => {
    payMethod = b.dataset.payMethod;
    $$('[data-pay-method]').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
  }));
}

function renderPayMethod(id, name, sub, icon) {
  const selected = payMethod === id;
  return `
    <button class="pay-method-row ${selected ? 'selected' : ''}" data-pay-method="${id}">
      <span class="pay-method-icon">${icon}</span>
      <span class="pay-method-text">
        <span class="pay-method-name">${escapeHtml(name)}</span>
        <span class="pay-method-sub">${escapeHtml(sub)}</span>
      </span>
      <span class="pay-method-radio">${selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" stroke="white" stroke-width="2.5" fill="none"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/></svg>'}</span>
    </button>
  `;
}

window.payStep1Proceed = function() {
  if (payMethod === 'cash') return renderPayCash();
  if (payMethod === 'split-bill') { toast('Split Bill flow opens'); return closeModal(); }
  if (payMethod === 'open-tab') { toast('Open tab created'); return closeModal(); }
  // Card reader or manual key-in → step 2
  renderPayStep2();
};

function renderPayStep2() {
  const total = state.payCardTotal + state.payTip;
  openModal(`
    <div class="pay-flow-head">
      <h2 class="pay-flow-title">Payment</h2>
      <button class="pay-flow-close" onclick="closeModal()">CLOSE</button>
    </div>
    <div class="pay-progress-row">
      <div class="pay-progress-label">READ CARD</div>
      <div class="pay-progress-pct">28%</div>
    </div>
    <div class="pay-progress-track"><div class="pay-progress-fill" style="width:28%;"></div></div>

    <div class="pay-flow-body">
      <div class="pay-ready-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
        <span>Terminal ready · Insert, tap, or swipe card</span>
      </div>

      <div class="pay-total-due">
        <div class="pay-total-label">TOTAL DUE</div>
        <div class="pay-total-val" id="payTotalDue">${fmt(total)}</div>
      </div>

      <div class="pay-tip-section">
        <div class="pay-tip-label">ADD TIP</div>
        <div class="pay-tip-grid">
          ${renderTipBtn(18, state.payCardTotal)}
          ${renderTipBtn(20, state.payCardTotal)}
          ${renderTipBtn(25, state.payCardTotal)}
        </div>
        <div class="pay-tip-custom">
          <span class="pay-tip-dollar">$</span>
          <input type="number" id="payTipInput" placeholder="0.00" min="0" step="0.01" value="${state.payTip > 0 ? state.payTip.toFixed(2) : ''}">
        </div>
      </div>

      <div class="pay-grand-row">
        <span>Grand Total</span>
        <strong id="payGrandTotal">${fmt(total)}</strong>
      </div>
    </div>
    <div class="pay-flow-foot pay-flow-foot-card">
      <button class="pay-charge-btn" id="payChargeBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/></svg>
        Charge Card <span id="payChargeAmt">${fmt(total)}</span>
      </button>
      <button class="pay-cancel-txn" onclick="payCancelTxn()">Cancel Transaction</button>
    </div>
  `, true);

  $$('[data-pay-tip]').forEach(b => b.addEventListener('click', () => {
    const pct = parseInt(b.dataset.payTip);
    state.payTip = state.payCardTotal * pct / 100;
    renderPayStep2();
  }));
  $('#payTipInput').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    state.payTip = isNaN(v) ? 0 : v;
    const t = state.payCardTotal + state.payTip;
    $('#payTotalDue').textContent = fmt(t);
    $('#payGrandTotal').textContent = fmt(t);
    $('#payChargeAmt').textContent = fmt(t);
  });
  // Fake transaction — show processing, then success, then complete the order
  $('#payChargeBtn').onclick = () => {
    renderPayProcessing();
    setTimeout(() => renderPaySuccess(), 1600);
  };
}

function renderPayProcessing() {
  openModal(`
    <div class="pay-flow-head">
      <h2 class="pay-flow-title">Payment</h2>
      <button class="pay-flow-close" disabled style="opacity:.4; cursor:not-allowed;">CLOSE</button>
    </div>
    <div class="pay-progress-row">
      <div class="pay-progress-label">PROCESSING</div>
      <div class="pay-progress-pct">72%</div>
    </div>
    <div class="pay-progress-track"><div class="pay-progress-fill" style="width:72%;"></div></div>
    <div class="pay-flow-body" style="padding: 56px 28px;">
      <div class="pay-spinner" aria-hidden="true">
        <svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4"/></svg>
      </div>
      <div class="pay-processing-title">Charging Card…</div>
      <div class="pay-processing-sub">Please leave the card inserted</div>
      <div class="pay-total-val" style="font-size:32px; margin-top:24px;">${fmt(state.payCardTotal + state.payTip)}</div>
    </div>
  `, true);
}

function renderPaySuccess() {
  const total = state.payCardTotal + state.payTip;
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const authCode = String(Math.floor(100000 + Math.random() * 900000));
  openModal(`
    <div class="pay-flow-head">
      <h2 class="pay-flow-title">Payment</h2>
      <button class="pay-flow-close" onclick="finishFakePayment()">DONE</button>
    </div>
    <div class="pay-progress-row">
      <div class="pay-progress-label">APPROVED</div>
      <div class="pay-progress-pct" style="color:var(--success);">100%</div>
    </div>
    <div class="pay-progress-track"><div class="pay-progress-fill" style="width:100%; background:var(--success);"></div></div>
    <div class="pay-flow-body" style="padding: 40px 28px;">
      <div class="pay-success-check" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>
      </div>
      <div class="pay-success-title">Payment Approved</div>
      <div class="pay-success-sub">Authorization: ${authCode} · VISA ending ${last4}</div>
      <div class="pay-receipt-card">
        <div class="pay-receipt-row"><span>Subtotal</span><strong>${fmt(state.payCardTotal - state.payCardTotal * (SETTINGS.tax.rate / 100) / (1 + SETTINGS.tax.rate / 100))}</strong></div>
        <div class="pay-receipt-row"><span>Tax</span><strong>${fmt(state.payCardTotal * (SETTINGS.tax.rate / 100) / (1 + SETTINGS.tax.rate / 100))}</strong></div>
        ${state.payTip > 0 ? `<div class="pay-receipt-row"><span>Tip</span><strong>${fmt(state.payTip)}</strong></div>` : ''}
        <div class="pay-receipt-row pay-receipt-total"><span>Total Charged</span><strong>${fmt(total)}</strong></div>
      </div>
      <div class="pay-receipt-actions">
        <button class="pay-receipt-btn" onclick="toast('Receipt printed')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print Receipt
        </button>
        <button class="pay-receipt-btn" onclick="toast('Receipt emailed')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Email
        </button>
        <button class="pay-receipt-btn" onclick="toast('Receipt sent via SMS')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Text
        </button>
      </div>
    </div>
    <div class="pay-flow-foot pay-flow-foot-card">
      <button class="pay-charge-btn" onclick="finishFakePayment()" style="background:var(--success);">
        New Order
      </button>
    </div>
  `, true);
}

window.finishFakePayment = function() {
  processPayment(state.payCardTotal + state.payTip, state.payCashTotal);
};

function renderTipBtn(pct, base) {
  const amt = base * pct / 100;
  const active = Math.abs(state.payTip - amt) < 0.005;
  return `
    <button class="pay-tip-btn ${active ? 'active' : ''}" data-pay-tip="${pct}">
      <span class="pay-tip-pct">${pct}%</span>
      <span class="pay-tip-amt">$${amt.toFixed(2)}</span>
    </button>
  `;
}

window.payCancelTxn = function() {
  toast('Transaction cancelled');
  closeModal();
};

function renderPayCash() {
  openModal(`
    <div class="pay-flow-head">
      <h2 class="pay-flow-title">Payment</h2>
      <button class="pay-flow-close" onclick="closeModal()">CLOSE</button>
    </div>
    <div class="pay-progress-row">
      <div class="pay-progress-label">CASH TENDERED</div>
      <div class="pay-progress-pct">28%</div>
    </div>
    <div class="pay-progress-track"><div class="pay-progress-fill" style="width:28%;"></div></div>
    <div class="pay-flow-body">
      <div class="pay-total-due">
        <div class="pay-total-label">TOTAL DUE</div>
        <div class="pay-total-val">${fmt(state.payCashTotal)}</div>
      </div>
      <div class="form-group" style="margin-top:24px;">
        <label class="form-label" for="cashTendered">Cash tendered</label>
        <input class="form-input" id="cashTendered" type="number" step="0.01" placeholder="0.00" autofocus>
      </div>
      <div class="pay-grand-row" id="cashChangeRow" style="display:none;">
        <span>Change due</span>
        <strong id="cashChange">$0.00</strong>
      </div>
    </div>
    <div class="pay-flow-foot pay-flow-foot-card">
      <button class="pay-charge-btn" id="cashConfirmBtn" disabled>Confirm Cash Payment</button>
      <button class="pay-cancel-txn" onclick="payCancelTxn()">Cancel Transaction</button>
    </div>
  `, true);
  const input = $('#cashTendered');
  const btn = $('#cashConfirmBtn');
  input.oninput = () => {
    const v = parseFloat(input.value);
    const change = isNaN(v) ? 0 : v - state.payCashTotal;
    if (!isNaN(v) && v >= state.payCashTotal) {
      $('#cashChangeRow').style.display = 'flex';
      $('#cashChange').textContent = fmt(change);
      btn.disabled = false;
    } else {
      $('#cashChangeRow').style.display = 'none';
      btn.disabled = true;
    }
  };
  btn.onclick = () => processPayment(state.payCardTotal, state.payCashTotal);
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

/* ─── TABLES (Pass 1: Tables / Waitlist / Reservations) ──────────── */

// Extended table model: room, position, shape, seats
// Two rooms: Party room and Garden Hall. Layout positions are in % of container.
const FLOOR_TABLES = [
  // Party room (rendered when room === 'party')
  { num: 'T-1',  room: 'party', shape: 'round', seats: 4, x: 18, y: 18, w: 78, h: 78 },
  { num: 'T-2',  room: 'party', shape: 'round', seats: 4, x: 32, y: 18, w: 78, h: 78 },
  { num: 'T-3',  room: 'party', shape: 'round', seats: 2, x: 56, y: 22, w: 56, h: 56 },
  { num: 'T-4',  room: 'party', shape: 'rect',  seats: 4, x: 76, y: 12, w: 92, h: 56 },
  { num: 'T-5',  room: 'party', shape: 'rect',  seats: 4, x: 76, y: 32, w: 92, h: 56 },
  { num: 'T-6',  room: 'party', shape: 'rect',  seats: 6, x: 80, y: 56, w: 110, h: 56 },
  { num: 'T-7',  room: 'party', shape: 'round', seats: 2, x: 50, y: 50, w: 60, h: 60 },
  { num: 'T-8',  room: 'party', shape: 'round', seats: 2, x: 26, y: 78, w: 70, h: 70 },
  { num: 'T-9',  room: 'party', shape: 'round', seats: 2, x: 36, y: 78, w: 70, h: 70 },
  { num: 'T-10', room: 'party', shape: 'round', seats: 2, x: 45, y: 78, w: 70, h: 70 },
  { num: 'T-11', room: 'party', shape: 'round', seats: 2, x: 54, y: 78, w: 70, h: 70 },
  { num: 'T-12', room: 'party', shape: 'round', seats: 2, x: 63, y: 78, w: 70, h: 70 },
  { num: 'T-13', room: 'party', shape: 'round', seats: 2, x: 72, y: 78, w: 70, h: 70 },
  { num: 'T-14', room: 'party', shape: 'round', seats: 2, x: 81, y: 78, w: 70, h: 70 },
  // Garden Hall
  { num: 'F-1',  room: 'saucy', shape: 'round', seats: 4, x: 20, y: 25, w: 80, h: 80 },
  { num: 'F-2',  room: 'saucy', shape: 'round', seats: 4, x: 38, y: 25, w: 80, h: 80 },
  { num: 'F-3',  room: 'saucy', shape: 'rect',  seats: 6, x: 60, y: 20, w: 110, h: 60 },
  { num: 'F-4',  room: 'saucy', shape: 'rect',  seats: 4, x: 75, y: 55, w: 90, h: 55 },
  { num: 'F-5',  room: 'saucy', shape: 'round', seats: 2, x: 30, y: 78, w: 60, h: 60 },
  { num: 'F-6',  room: 'saucy', shape: 'round', seats: 2, x: 50, y: 78, w: 60, h: 60 },
];

// Seed initial state per table — only one occupied to match the screenshot ("1/17 tables, 5% capacity")
const FLOOR_STATE = {};
FLOOR_TABLES.forEach((t, i) => {
  FLOOR_STATE[t.num] = (t.num === 'T-1')
    ? { status: 'occupied', server: 'Casey Walker', guests: 4, time: '75hr 13m', total: 77.64 }
    : { status: 'available' };
});

// Waitlist + Reservations data (empty by default — matches screenshots)
let WAITLIST = [];
let RESERVATIONS = [];

if (!state.tblTab) state.tblTab = 'tables';
if (!state.tblRoom) state.tblRoom = 'party';
if (!state.tblFilter) state.tblFilter = { server: 'all', status: 'all' };
if (!state.tblSelected) state.tblSelected = null;

function renderTables() {
  // Update counts on sub-tabs
  const tblCountEl = $('#tblCountMeta');
  if (tblCountEl) {
    const occupied = Object.values(FLOOR_STATE).filter(s => s.status === 'occupied').length;
    tblCountEl.textContent = `${occupied}/${FLOOR_TABLES.length}`;
  }
  const waitEl = $('#waitCountMeta');
  if (waitEl) waitEl.textContent = WAITLIST.length;

  // Tab buttons
  $$('[data-tbl-tab]').forEach(b => {
    const active = b.dataset.tblTab === state.tblTab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
    b.onclick = () => { state.tblTab = b.dataset.tblTab; renderTables(); };
  });

  // Side panel content
  if (state.tblTab === 'tables') {
    renderTablesSide();
  } else if (state.tblTab === 'waitlist') {
    renderWaitlistSide();
  } else {
    renderReservationsSide();
  }

  // Floor (always visible)
  renderFloorMain();
}

function renderTablesSide() {
  const inRoom = FLOOR_TABLES.filter(t => t.room === state.tblRoom);
  const occupied = inRoom.filter(t => FLOOR_STATE[t.num].status === 'occupied');
  const capacityPct = Math.round((occupied.length / inRoom.length) * 100);

  $('#tblSide').innerHTML = `
    <div class="tbl-side-head">
      <div class="tbl-side-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M7 11v8M17 11v8"/></svg>
        Tables
      </div>
      <span class="tbl-side-pill">${occupied.length}/${inRoom.length} tables</span>
    </div>
    <div style="font-size:11.5px; color:var(--slate-500); margin-bottom:14px; padding:0 4px;">${capacityPct}% capacity</div>
    <div class="tbl-side-filters">
      <button class="tbl-side-filter ${state.tblFilter.server === 'all' ? 'active' : ''}" id="filterServer">
        Server <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <button class="tbl-side-filter ${state.tblFilter.status !== 'all' ? 'active' : ''}" id="filterStatus">
        Status <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
    <div class="tbl-room-group">
      <div class="tbl-room-group-label">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        ${state.tblRoom === 'party' ? 'Party Room' : 'Garden Hall'}
      </div>
      ${inRoom.map(t => renderSideRow(t)).join('')}
    </div>
  `;

  $$('.tbl-side-row').forEach(r => r.addEventListener('click', () => {
    state.tblSelected = r.dataset.tblNum;
    openFloorTableModal(state.tblSelected);
  }));
  $('#filterServer').onclick = () => toast('Server filter coming soon');
  $('#filterStatus').onclick = () => toast('Status filter coming soon');
}

function renderSideRow(t) {
  const s = FLOOR_STATE[t.num];
  // Per screenshots: every table reads "Table 1" with seat count subtitle,
  // except T-1/T-2 which keep their short codes.
  const label = (t.num === 'T-1' || t.num === 'T-2') ? t.num : 'Table 1';
  if (s.status === 'occupied') {
    return `<div class="tbl-side-row occupied ${state.tblSelected === t.num ? 'active' : ''}" data-tbl-num="${t.num}">
      <span class="tbl-side-row-dot" aria-hidden="true"></span>
      <div style="flex:1; min-width:0;">
        <div class="tbl-side-row-name">${label}</div>
        <span class="tbl-side-row-meta">${s.server} · ${s.guests} guests</span>
      </div>
      <div style="text-align:right;">
        <div class="tbl-side-row-amount">${fmt(s.total)}</div>
        <span class="tbl-side-row-time">${s.time}</span>
      </div>
    </div>`;
  }
  return `<div class="tbl-side-row ${state.tblSelected === t.num ? 'active' : ''}" data-tbl-num="${t.num}">
    <span class="tbl-side-row-dot" aria-hidden="true"></span>
    <span class="tbl-side-row-name">${label}</span>
    <span class="tbl-side-row-status">Available</span>
  </div>`;
}

function renderWaitlistSide() {
  $('#tblSide').innerHTML = `
    <div class="tbl-side-head">
      <div class="tbl-side-title">Waitlist</div>
      <div style="display:flex; gap:6px; align-items:center;">
        <span class="tbl-side-pill">${WAITLIST.length}</span>
        <button class="tbl-side-add" id="addWaitBtn" aria-label="Add to waitlist">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>
    ${WAITLIST.length === 0 ? `
      <div class="tbl-side-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <div class="tbl-side-empty-text">No parties waiting</div>
        <div class="tbl-side-empty-sub">Tap + to add someone</div>
      </div>
    ` : WAITLIST.map((w, i) => `
      <div class="tbl-side-row" data-wait-idx="${i}">
        <span class="tbl-side-row-dot" aria-hidden="true"></span>
        <div style="flex:1; min-width:0;">
          <div class="tbl-side-row-name">${escapeHtml(w.name)}</div>
          <span class="tbl-side-row-meta">${w.party} guests · ${w.quoted} min</span>
        </div>
      </div>
    `).join('')}
  `;
  const addBtn = $('#addWaitBtn');
  if (addBtn) addBtn.onclick = openAddToWaitlist;
}

function renderReservationsSide() {
  const today = new Date(2026, 4, 15);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  $('#tblSide').innerHTML = `
    <div class="tbl-side-head">
      <div class="tbl-side-title">Reservations</div>
      <button class="tbl-side-add" id="addResBtn" aria-label="Add reservation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <div class="res-date-bar">
      <button class="res-date-nav" id="resPrev" aria-label="Previous day"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="res-date-display" id="resDate">Today</div>
      <button class="res-date-nav" id="resNext" aria-label="Next day"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
    <div class="res-count">${RESERVATIONS.length} upcoming today</div>
    ${RESERVATIONS.length === 0 ? `
      <div class="tbl-side-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
        <div class="tbl-side-empty-text">No reservations today</div>
        <div class="tbl-side-empty-sub">Tap + to add one</div>
      </div>
    ` : RESERVATIONS.map((r, i) => `
      <div class="tbl-side-row" data-res-idx="${i}">
        <span class="tbl-side-row-dot" aria-hidden="true"></span>
        <div style="flex:1; min-width:0;">
          <div class="tbl-side-row-name">${escapeHtml(r.name)}</div>
          <span class="tbl-side-row-meta">${r.time} · ${r.party} guests</span>
        </div>
      </div>
    `).join('')}
  `;
  $('#resPrev').onclick = () => toast('Previous day');
  $('#resNext').onclick = () => toast('Next day');
  const addBtn = $('#addResBtn');
  if (addBtn) addBtn.onclick = openAddReservation;
}

function renderFloorMain() {
  // Room bar
  $('#tblRoomBar').innerHTML = `
    <button class="tbl-room ${state.tblRoom === 'party' ? 'active' : ''}" data-room="party">Party room</button>
    <button class="tbl-room ${state.tblRoom === 'saucy' ? 'active' : ''}" data-room="saucy">Garden Hall</button>
    <div class="tbl-room-search">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input id="tblSearch" type="search" placeholder="Search tables…" aria-label="Search tables">
    </div>
    <div class="tbl-room-actions">
      <button class="tbl-room-action warn ${state.tblMergeMode ? 'active' : ''}" id="mergeBtn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6V3M16 6V3M3 10h18M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/></svg>
        ${state.tblMergeMode ? 'Cancel Merge' : 'Merge Tables'}
      </button>
      <button class="tbl-room-action ${state.tblEditMode ? 'active' : ''}" id="editLayoutBtn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        ${state.tblEditMode ? 'Done Editing' : 'Edit Layout'}
      </button>
    </div>
  `;
  $$('[data-room]').forEach(b => b.onclick = () => {
    state.tblRoom = b.dataset.room;
    renderTables();
  });
  $('#mergeBtn').onclick = () => {
    // Toggle merge-selection mode — first tap highlights, second tap merges
    if (state.tblMergeMode) {
      state.tblMergeMode = false;
      state.tblMergeFirst = null;
      toast('Merge cancelled');
    } else {
      state.tblMergeMode = true;
      state.tblMergeFirst = null;
      state.tblEditMode = false;  // exit edit mode if active
      toast('Tap a table, then tap another to merge them');
    }
    renderTables();
  };
  $('#editLayoutBtn').onclick = () => {
    // Toggle edit mode — same as the floor toolbar button
    state.tblEditMode = !state.tblEditMode;
    state.tblMergeMode = false;  // exit merge mode if active
    state.tblMergeFirst = null;
    renderTables();
  };
  $('#tblSearch').oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    $$('.floor-table').forEach(el => {
      const num = el.dataset.tblNum.toLowerCase();
      el.style.opacity = !q || num.includes(q) ? '1' : '0.25';
    });
  };

  // Floor plan
  const inRoom = FLOOR_TABLES.filter(t => t.room === state.tblRoom);
  const editMode = !!state.tblEditMode;
  const mergeMode = !!state.tblMergeMode;
  $('#tblFloor').innerHTML = `
    <div class="tbl-floor-toolbar">
      ${editMode ? `
        <button class="tbl-tool-btn active" id="tblEditToggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
          Done Editing
        </button>
        <button class="tbl-tool-btn" id="tblAddTable">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add Table
        </button>
        <button class="tbl-tool-btn" id="tblResetLayout">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/></svg>
          Reset Layout
        </button>
        <span class="tbl-tool-hint">Drag tables to move · Drop one onto another to merge</span>
      ` : mergeMode ? `
        <button class="tbl-tool-btn active" id="tblEditToggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          Cancel Merge
        </button>
        <span class="tbl-tool-hint">${state.tblMergeFirst ? `${state.tblMergeFirst} selected — tap a second table to merge` : 'Tap two tables to merge them into one check'}</span>
      ` : `
        <button class="tbl-tool-btn" id="tblEditToggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Layout
        </button>
        <span class="tbl-tool-hint">Tap a table to view details</span>
      `}
    </div>
    ${inRoom.map(t => {
      const s = FLOOR_STATE[t.num];
      const isMerged = MERGED_GROUPS.some(g => g.tables.includes(t.num));
      const mergeRole = isMerged ? (MERGED_GROUPS.find(g => g.tables[0] === t.num) ? 'lead' : 'child') : null;
      const classes = ['floor-table', t.shape, s.status === 'occupied' ? 'occupied' : '',
                       state.tblSelected === t.num ? 'selected' : '',
                       editMode ? 'editable' : '', mergeRole ? `merged-${mergeRole}` : '',
                       state.tblMergeMode ? 'merge-selectable' : '',
                       state.tblMergeFirst === t.num ? 'merge-pending' : ''].filter(Boolean).join(' ');
      const label = (t.num === 'T-1' || t.num === 'T-2') ? t.num : 'Table 1';
      const mergedGroup = MERGED_GROUPS.find(g => g.tables.includes(t.num));
      const mergedLabel = mergedGroup ? `${mergedGroup.tables.length}× merged` : '';
      return `<div class="${classes}" data-tbl-num="${t.num}"
        style="left:${t.x}%; top:${t.y}%; width:${t.w}px; height:${t.h}px;"
        aria-label="${label}, ${t.seats} seats, ${s.status}" role="button" tabindex="0">
        <span class="floor-table-name">${label}</span>
        <span class="floor-table-seats">${t.seats} SEATS</span>
        ${mergedLabel ? `<span class="floor-table-merged-badge">${mergedLabel}</span>` : ''}
      </div>`;
    }).join('')}
    ${renderMergedConnectors(inRoom)}
    <!-- Decorations: plant, bar shape -->
    <svg class="floor-deco" style="left:6%; bottom:8%; width:60px; height:60px;" viewBox="0 0 60 60" aria-hidden="true">
      <path d="M30 45 L42 55 L42 30 Q42 18 30 18 Q18 18 18 30 L18 55 Z" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1"/>
    </svg>
    <svg class="floor-deco" style="left:16%; bottom:8%; width:36px; height:46px;" viewBox="0 0 36 46" aria-hidden="true">
      <rect x="14" y="34" width="8" height="10" rx="1" fill="#A47148"/>
      <path d="M18 6 Q8 14 10 28 Q14 22 18 24 Q22 22 26 28 Q28 14 18 6 Z" fill="#5CB385"/>
    </svg>
    <div class="floor-zoom">
      <button class="floor-zoom-btn" id="zoomIn" aria-label="Zoom in"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
      <button class="floor-zoom-btn" id="zoomOut" aria-label="Zoom out"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg></button>
    </div>
  `;

  // Wire toolbar
  $('#tblEditToggle').onclick = () => {
    if (state.tblMergeMode) {
      // In merge mode → toolbar button cancels merge
      state.tblMergeMode = false;
      state.tblMergeFirst = null;
    } else {
      state.tblEditMode = !state.tblEditMode;
    }
    renderTables();
  };
  const addTableBtn = $('#tblAddTable');
  if (addTableBtn) addTableBtn.onclick = addNewTable;
  const resetBtn = $('#tblResetLayout');
  if (resetBtn) resetBtn.onclick = () => {
    if (confirm('Reset all table positions and merges to defaults?')) {
      MERGED_GROUPS.length = 0;
      // Restore original positions from snapshot
      FLOOR_TABLES.forEach((t, i) => {
        const orig = FLOOR_TABLES_ORIGINAL[i];
        if (orig) { t.x = orig.x; t.y = orig.y; }
      });
      renderTables();
      toast('Layout reset to defaults');
    }
  };

  // Wire table interactions (drag in edit mode, merge-select in merge mode, else open modal)
  $$('.floor-table').forEach(el => {
    if (editMode) {
      attachDragHandlers(el);
    } else if (state.tblMergeMode) {
      // Highlight first selection
      if (state.tblMergeFirst === el.dataset.tblNum) {
        el.classList.add('merge-pending');
      }
      el.addEventListener('click', () => {
        const num = el.dataset.tblNum;
        if (!state.tblMergeFirst) {
          // First tap — remember and highlight
          state.tblMergeFirst = num;
          $$('.floor-table').forEach(x => x.classList.remove('merge-pending'));
          el.classList.add('merge-pending');
          toast(`${num} selected — tap another table to merge`);
        } else if (state.tblMergeFirst === num) {
          // Tapped same table — deselect
          state.tblMergeFirst = null;
          el.classList.remove('merge-pending');
          toast('Selection cleared — tap a table to start');
        } else {
          // Second tap — open merge confirmation
          const firstNum = state.tblMergeFirst;
          state.tblMergeFirst = null;
          state.tblMergeMode = false;
          renderTables();
          promptMergeTables(firstNum, num);
        }
      });
    } else {
      el.addEventListener('click', () => {
        state.tblSelected = el.dataset.tblNum;
        openFloorTableModal(el.dataset.tblNum);
      });
    }
  });
  $('#zoomIn').onclick = () => toast('Zoom in');
  $('#zoomOut').onclick = () => toast('Zoom out');
}

// Snapshot of original table positions (for Reset Layout)
const FLOOR_TABLES_ORIGINAL = FLOOR_TABLES.map(t => ({ num: t.num, x: t.x, y: t.y }));

// Merged table groups — array of { id, tables: ['T-1','T-2'], seats }
let MERGED_GROUPS = [];

function renderMergedConnectors(tables) {
  // Draw a thin line between merged tables to visually connect them
  if (MERGED_GROUPS.length === 0) return '';
  let html = '';
  MERGED_GROUPS.forEach(grp => {
    if (grp.tables.length < 2) return;
    const inThisRoom = grp.tables.every(tn => tables.find(t => t.num === tn));
    if (!inThisRoom) return;
    // For each consecutive pair, render a thin connector strip
    for (let i = 1; i < grp.tables.length; i++) {
      const a = tables.find(t => t.num === grp.tables[i - 1]);
      const b = tables.find(t => t.num === grp.tables[i]);
      if (!a || !b) continue;
      html += `<div class="floor-merge-conn" style="left:calc(${a.x}% + ${a.w/2}px); top:calc(${a.y}% + ${a.h/2}px); --bx:calc(${b.x}% + ${b.w/2}px); --by:calc(${b.y}% + ${b.h/2}px);"></div>`;
    }
  });
  return html;
}

function addNewTable() {
  const room = state.tblRoom;
  // Find next unused number
  const existing = FLOOR_TABLES.filter(t => t.room === room).map(t => t.num);
  let n = 1;
  const prefix = room === 'party' ? 'T-' : 'F-';
  while (existing.includes(prefix + n)) n++;
  const newTbl = { num: prefix + n, room, shape: 'round', seats: 4, x: 30, y: 30, w: 70, h: 70 };
  FLOOR_TABLES.push(newTbl);
  FLOOR_STATE[newTbl.num] = { status: 'available' };
  FLOOR_TABLES_ORIGINAL.push({ num: newTbl.num, x: newTbl.x, y: newTbl.y });
  renderTables();
  toast(`${newTbl.num} added`);
}

/* Drag handlers — pointer events (mouse, touch, pen all work). */
function attachDragHandlers(el) {
  let dragging = false;
  let startX, startY, origX, origY, floorRect;
  const tbl = FLOOR_TABLES.find(t => t.num === el.dataset.tblNum);
  if (!tbl) return;

  const onDown = (e) => {
    if (!state.tblEditMode) return;
    e.preventDefault();
    dragging = true;
    el.setPointerCapture(e.pointerId);
    const floor = $('#tblFloor');
    floorRect = floor.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    origX = tbl.x;
    origY = tbl.y;
    el.classList.add('dragging');
  };

  const onMove = (e) => {
    if (!dragging) return;
    const dxPct = ((e.clientX - startX) / floorRect.width) * 100;
    const dyPct = ((e.clientY - startY) / floorRect.height) * 100;
    let nx = Math.max(0, Math.min(95, origX + dxPct));
    let ny = Math.max(0, Math.min(90, origY + dyPct));
    tbl.x = nx; tbl.y = ny;
    el.style.left = nx + '%';
    el.style.top = ny + '%';
    // Highlight any table being hovered as a drop target
    $$('.floor-table').forEach(other => {
      if (other === el) return;
      const r = other.getBoundingClientRect();
      const hit = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      other.classList.toggle('drop-target', hit);
    });
  };

  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture(e.pointerId);
    el.classList.remove('dragging');
    // Did we drop onto another table?
    const dropTarget = $$('.floor-table').find(o => o !== el && o.classList.contains('drop-target'));
    $$('.floor-table').forEach(o => o.classList.remove('drop-target'));
    if (dropTarget) {
      // Restore original position (since we'll merge)
      tbl.x = origX; tbl.y = origY;
      el.style.left = origX + '%';
      el.style.top = origY + '%';
      promptMergeTables(el.dataset.tblNum, dropTarget.dataset.tblNum);
    }
    // Re-render connectors
    const inRoom = FLOOR_TABLES.filter(t => t.room === state.tblRoom);
    const oldConn = $$('.floor-merge-conn');
    oldConn.forEach(c => c.remove());
    $('#tblFloor').insertAdjacentHTML('beforeend', renderMergedConnectors(inRoom));
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

function promptMergeTables(numA, numB) {
  const a = FLOOR_TABLES.find(t => t.num === numA);
  const b = FLOOR_TABLES.find(t => t.num === numB);
  if (!a || !b) return;

  // Are either already in a merged group?
  const groupA = MERGED_GROUPS.find(g => g.tables.includes(numA));
  const groupB = MERGED_GROUPS.find(g => g.tables.includes(numB));
  const totalSeats = (groupA ? groupA.seats : a.seats) + (groupB ? groupB.seats : b.seats);

  openModal(`
    <div class="modal-head">
      <div>
        <h2 class="modal-title" id="modalTitle">Merge ${numA} with ${numB}?</h2>
        <p class="modal-sub">Combined capacity: ${totalSeats} guests. Orders for both tables will share a single check.</p>
      </div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body" style="padding:8px 0;">
      <div style="display:flex; align-items:center; gap:14px; justify-content:center; padding:24px 0;">
        <div style="text-align:center;">
          <div style="width:64px; height:64px; border-radius:12px; background:#D4EFE4; border:2px solid #6FC9A4; display:grid; place-items:center; color:#145E40; font-weight:700; font-size:13px;">${numA}</div>
          <div style="font-size:11px; color:var(--slate-500); margin-top:6px;">${a.seats} seats</div>
        </div>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <div style="text-align:center;">
          <div style="width:64px; height:64px; border-radius:12px; background:var(--brand-50); border:2px solid var(--brand-500); display:grid; place-items:center; color:var(--brand-500); font-weight:700; font-size:13px;">Merged</div>
          <div style="font-size:11px; color:var(--brand-500); margin-top:6px; font-weight:600;">${totalSeats} seats</div>
        </div>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <div style="text-align:center;">
          <div style="width:64px; height:64px; border-radius:12px; background:#D4EFE4; border:2px solid #6FC9A4; display:grid; place-items:center; color:#145E40; font-weight:700; font-size:13px;">${numB}</div>
          <div style="font-size:11px; color:var(--slate-500); margin-top:6px;">${b.seats} seats</div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmMergeTables('${numA}','${numB}')">Merge Tables</button>
    </div>
  `);
}

window.confirmMergeTables = function(numA, numB) {
  const groupA = MERGED_GROUPS.find(g => g.tables.includes(numA));
  const groupB = MERGED_GROUPS.find(g => g.tables.includes(numB));
  if (groupA && groupB) {
    // Both already in groups → merge groups
    groupA.tables = [...new Set([...groupA.tables, ...groupB.tables])];
    groupA.seats = groupA.tables.reduce((s, n) => s + FLOOR_TABLES.find(t => t.num === n).seats, 0);
    MERGED_GROUPS.splice(MERGED_GROUPS.indexOf(groupB), 1);
  } else if (groupA) {
    if (!groupA.tables.includes(numB)) {
      groupA.tables.push(numB);
      groupA.seats += FLOOR_TABLES.find(t => t.num === numB).seats;
    }
  } else if (groupB) {
    if (!groupB.tables.includes(numA)) {
      groupB.tables.unshift(numA);
      groupB.seats += FLOOR_TABLES.find(t => t.num === numA).seats;
    }
  } else {
    const a = FLOOR_TABLES.find(t => t.num === numA);
    const b = FLOOR_TABLES.find(t => t.num === numB);
    MERGED_GROUPS.push({ id: 'G' + Date.now(), tables: [numA, numB], seats: a.seats + b.seats });
  }
  closeModal();
  renderTables();
  toast(`Tables ${numA} and ${numB} merged`);
};

function openFloorTableModal(num) {
  const t = FLOOR_TABLES.find(x => x.num === num);
  const s = FLOOR_STATE[num];
  if (!t) return;
  const label = num === 'T-1' ? 'Table 1' : num.replace(/^[TF]-/, 'T-');
  const mergedGroup = MERGED_GROUPS.find(g => g.tables.includes(num));
  let body, actions;
  if (s.status === 'occupied') {
    body = `
      <div class="form-group"><label class="form-label">Status</label><div class="form-input" style="text-align:left;"><strong style="color:var(--warning);">Occupied</strong> · ${s.guests} guests</div></div>
      <div class="form-group"><label class="form-label">Server</label><div class="form-input" style="text-align:left;">${escapeHtml(s.server)}</div></div>
      <div class="form-group"><label class="form-label">Open total</label><div class="form-input" style="text-align:left; font-variant-numeric:tabular-nums;">${fmt(s.total)}</div></div>
      <div class="form-group"><label class="form-label">Time at table</label><div class="form-input" style="text-align:left;">${s.time}</div></div>
      ${mergedGroup ? `<div class="form-group"><label class="form-label">Merged with</label><div class="form-input" style="text-align:left;">${mergedGroup.tables.filter(x => x !== num).join(', ')} · ${mergedGroup.seats} total seats</div></div>` : ''}
    `;
    actions = `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      ${mergedGroup ? `<button class="btn btn-secondary" onclick="unmergeTable('${num}')">Unmerge</button>` : ''}
      <button class="btn btn-primary" onclick="closeFloorTable('${num}')">Close & Pay</button>
    `;
  } else {
    body = `
      <div class="form-group"><label class="form-label">Seats</label><div class="form-input" style="text-align:left;">${t.seats}-seat ${t.shape === 'round' ? 'round' : 'rectangular'} table</div></div>
      ${mergedGroup ? `<div class="form-group"><label class="form-label">Merged with</label><div class="form-input" style="text-align:left;">${mergedGroup.tables.filter(x => x !== num).join(', ')} · ${mergedGroup.seats} total seats</div></div>` : ''}
      <div class="form-group"><label class="form-label" for="partySize">Party size</label><input class="form-input" type="number" id="partySize" min="1" max="${mergedGroup ? mergedGroup.seats : t.seats}" value="${Math.min(2, mergedGroup ? mergedGroup.seats : t.seats)}"></div>
      <div class="form-group"><label class="form-label" for="serverName">Server</label><input class="form-input" type="text" id="serverName" value="Casey Walker"></div>
    `;
    actions = `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      ${mergedGroup ? `<button class="btn btn-secondary" onclick="unmergeTable('${num}')">Unmerge</button>` : ''}
      <button class="btn btn-primary" onclick="seatFloorTable('${num}')">Seat Party</button>
    `;
  }
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">${label}${mergedGroup ? ' <span style="font-size:11px; padding:3px 8px; background:var(--brand-50); color:var(--brand-500); border-radius:999px; font-weight:600; margin-left:6px; vertical-align:middle;">Merged</span>' : ''}</h2><p class="modal-sub">${state.tblRoom === 'party' ? 'Party Room' : 'Garden Hall'} · ${t.seats} seats</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">${body}</div>
    <div class="modal-actions">${actions}</div>
  `);
}

window.unmergeTable = function(num) {
  const groupIdx = MERGED_GROUPS.findIndex(g => g.tables.includes(num));
  if (groupIdx < 0) return;
  MERGED_GROUPS.splice(groupIdx, 1);
  closeModal();
  renderTables();
  toast(`${num} unmerged`);
};

window.seatFloorTable = function(num) {
  const t = FLOOR_TABLES.find(x => x.num === num);
  const size = parseInt($('#partySize').value) || 2;
  const server = $('#serverName').value.trim() || 'Server';
  FLOOR_STATE[num] = { status: 'occupied', server, guests: size, time: '0m', total: 0 };
  closeModal(); renderTables();
  toast(`${num}: party of ${size} seated`);
};

window.closeFloorTable = function(num) {
  const s = FLOOR_STATE[num];
  const total = s.total;
  FLOOR_STATE[num] = { status: 'available' };
  closeModal(); renderTables();
  toast(`${num} closed · ${fmt(total)} paid`);
};

function openAddToWaitlist() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Add to Waitlist</h2><p class="modal-sub">Quote a wait time for the party.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="waitName">Guest name</label><input class="form-input" type="text" id="waitName" placeholder="e.g. Samir K."></div>
      <div class="form-group"><label class="form-label" for="waitParty">Party size</label><input class="form-input" type="number" id="waitParty" min="1" value="2"></div>
      <div class="form-group"><label class="form-label" for="waitQuoted">Quoted wait (minutes)</label><input class="form-input" type="number" id="waitQuoted" min="0" value="15"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveWaitlist()">Add</button>
    </div>
  `);
}

window.saveWaitlist = function() {
  const n = $('#waitName').value.trim();
  if (!n) { toast('Name required', true); return; }
  WAITLIST.push({
    name: n,
    party: parseInt($('#waitParty').value) || 2,
    quoted: parseInt($('#waitQuoted').value) || 15
  });
  closeModal(); renderTables();
  toast(`${n} added to waitlist`);
};

function openAddReservation() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">New Reservation</h2><p class="modal-sub">Book a table for a future party.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="resName">Guest name</label><input class="form-input" type="text" id="resName" placeholder="e.g. Samir K."></div>
      <div class="form-group"><label class="form-label" for="resParty">Party size</label><input class="form-input" type="number" id="resParty" min="1" value="2"></div>
      <div class="form-group"><label class="form-label" for="resTime">Time</label><input class="form-input" type="text" id="resTime" placeholder="e.g. 7:30 PM"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveReservation()">Book</button>
    </div>
  `);
}

window.saveReservation = function() {
  const n = $('#resName').value.trim();
  if (!n) { toast('Name required', true); return; }
  RESERVATIONS.push({
    name: n,
    party: parseInt($('#resParty').value) || 2,
    time: $('#resTime').value.trim() || '7:00 PM'
  });
  closeModal(); renderTables();
  toast(`Reservation for ${n} booked`);
};

// Legacy helpers (kept for home tile counters that read TABLES)
function openTableModal(num) {
  // Map legacy numeric tables to floor tables for backward compat from home tile
  const t = FLOOR_TABLES[Math.min(num - 1, FLOOR_TABLES.length - 1)] || FLOOR_TABLES[0];
  openFloorTableModal(t.num);
}

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
    <button class="orders-pill ${state.ordersFilter === 'online' ? 'active' : ''}" data-filter="online">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
      Online
    </button>
    <button class="orders-pill ${state.ordersFilter === 'dine-in' ? 'active' : ''}" data-filter="dine-in">Dine-In</button>
    <button class="orders-pill ${state.ordersFilter === 'takeaway' ? 'active' : ''}" data-filter="takeaway">Takeaway</button>
    <button class="orders-pill ${state.ordersFilter === 'delivery' ? 'active' : ''}" data-filter="delivery">Delivery</button>
    <span class="orders-pill-divider"></span>
    <button class="orders-sort ${state.ordersSort === 'date' ? 'active' : ''}" data-sort="date">Date <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg></button>
    <button class="orders-sort ${state.ordersSort === 'amount' ? 'active' : ''}" data-sort="amount">Amount</button>
    <button class="orders-sort ${state.ordersSort === 'status' ? 'active' : ''}" data-sort="status">Status</button>
  `;

  const search = state.ordersSearch.trim().toLowerCase();
  let list = state.ordersPeriod === '7d' ? PAST_ORDERS.slice() : PAST_ORDERS.filter(o => o.period === state.ordersPeriod);
  if (state.ordersFilter === 'attention') list = list.filter(o => o.status === 'pending' || o.status === 'unpaid');
  else if (state.ordersFilter === 'refunded') list = list.filter(o => o.status === 'refunded');
  else if (state.ordersFilter === 'online') list = list.filter(o => o.mode === 'delivery' || o.mode === 'takeaway');
  else if (state.ordersFilter) list = list.filter(o => o.mode === state.ordersFilter);
  if (search) list = list.filter(o => o.id.toLowerCase().includes(search) || o.customer.toLowerCase().includes(search));

  // Sort
  if (state.ordersSort === 'amount') list.sort((a,b) => b.amount - a.amount);
  else if (state.ordersSort === 'status') list.sort((a,b) => a.status.localeCompare(b.status));
  // else date order (default)

  if (list.length === 0) {
    $('#ordersList').innerHTML = `<div class="order-row-empty">No orders match these filters.</div>`;
  } else {
    const modeIcon = (m) => {
      if (m === 'dine-in') return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12V8a7 7 0 0114 0v4"/><path d="M3 12h18l-1 9H4l-1-9z"/></svg>';
      if (m === 'delivery') return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/></svg>';
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18l-2 12H5L3 7z"/><path d="M8 7V5a4 4 0 018 0v2"/></svg>';
    };
    const modeLabel = (m) => m === 'dine-in' ? 'Dine In' : m === 'delivery' ? 'Delivery' : 'Takeaway';
    const isPending = (o) => o.status === 'pending' || o.status === 'unpaid';

    $('#ordersList').innerHTML = list.map(o => `
      <button class="order-row ${isPending(o) ? 'order-pending' : ''}" data-order-id="${o.id}" aria-label="Order ${o.id}, ${modeLabel(o.mode)}, ${o.customer}, ${o.status}, ${fmt(o.amount)}">
        <div class="order-row-id">
          <span>${o.id}</span>
          <span class="order-time">${o.time}</span>
          ${isPending(o) ? '<svg class="order-warn" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : ''}
        </div>
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
  $$('.orders-sort').forEach(p => p.addEventListener('click', () => {
    state.ordersSort = state.ordersSort === p.dataset.sort ? null : p.dataset.sort;
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
  // Compute counts
  const togo = KITCHEN_TICKETS.filter(t => !state.bumpedTickets.has(t.id) && /TO GO|TAKEOUT/i.test(t.mode)).length;
  const dineIn = KITCHEN_TICKETS.filter(t => !state.bumpedTickets.has(t.id) && /DINE/i.test(t.mode)).length;
  const delivery = KITCHEN_TICKETS.filter(t => !state.bumpedTickets.has(t.id) && /DELIVERY/i.test(t.mode)).length;
  const cooking = KITCHEN_TICKETS.filter(t => !state.bumpedTickets.has(t.id) && t.items.some(i => !i.served)).length;
  const servedCount = KITCHEN_TICKETS.reduce((s, t) => s + t.items.filter(i => i.served).length, 0);
  const done = state.bumpedTickets.size;

  if (!state.kitchenStatus) state.kitchenStatus = 'cooking';
  if (!state.kitchenTab) state.kitchenTab = 'all';
  if (!state.kdsBulkMode) state.kdsBulkMode = false;
  if (!state.kdsSelected) state.kdsSelected = new Set();

  const now = new Date();
  const timeStamp = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Build the visible list (respect tab + status filter)
  let list = KITCHEN_TICKETS.slice();
  // Status filter
  if (state.kitchenStatus === 'cooking') {
    list = list.filter(t => !state.bumpedTickets.has(t.id) && t.items.some(i => !i.served));
  } else if (state.kitchenStatus === 'served') {
    list = list.filter(t => !state.bumpedTickets.has(t.id) && t.items.every(i => i.served));
  } else if (state.kitchenStatus === 'done') {
    list = list.filter(t => state.bumpedTickets.has(t.id));
  }
  // Source filter
  if (state.kitchenTab === 'togo') list = list.filter(t => /TO GO|TAKEOUT/i.test(t.mode));
  if (state.kitchenTab === 'dine-in') list = list.filter(t => /DINE/i.test(t.mode));
  if (state.kitchenTab === 'delivery') list = list.filter(t => /DELIVERY/i.test(t.mode));

  const allCount = list.length; // visible after status filter, used for "All" pill
  // For tab counts, use status-filtered base
  const baseForTabs = state.kitchenStatus === 'cooking'
    ? KITCHEN_TICKETS.filter(t => !state.bumpedTickets.has(t.id) && t.items.some(i => !i.served))
    : state.kitchenStatus === 'served'
      ? KITCHEN_TICKETS.filter(t => !state.bumpedTickets.has(t.id) && t.items.every(i => i.served))
      : KITCHEN_TICKETS.filter(t => state.bumpedTickets.has(t.id));
  const tabAll = baseForTabs.length;
  const tabTogo = baseForTabs.filter(t => /TO GO|TAKEOUT/i.test(t.mode)).length;
  const tabDine = baseForTabs.filter(t => /DINE/i.test(t.mode)).length;
  const tabDel = baseForTabs.filter(t => /DELIVERY/i.test(t.mode)).length;

  // Toolbar
  $('#kitchenToolbar').innerHTML = `
    <div class="kds-toolbar-row">
      <div class="kds-toolbar-left">
        <button class="kds-pill ${state.kitchenStatus === 'cooking' ? 'active' : ''}" data-kds-status="cooking">
          Cooking <span class="kds-pill-num">${cooking}</span>
        </button>
        <button class="kds-pill ${state.kitchenStatus === 'served' ? 'active' : ''}" data-kds-status="served">
          Served <span class="kds-pill-num">${servedCount}</span>
        </button>
        <button class="kds-pill ${state.kitchenStatus === 'done' ? 'active' : ''}" data-kds-status="done">
          Done <span class="kds-pill-num">${done}</span>
        </button>
      </div>
      <div class="kds-toolbar-right">
        <button class="kds-pill ${state.kitchenTab === 'all' ? 'active' : ''}" data-tab="all">
          All <span class="kds-pill-num">${tabAll}</span>
        </button>
        <button class="kds-pill ${state.kitchenTab === 'delivery' ? 'active' : ''}" data-tab="delivery">
          Delivery${tabDel ? ` <span class="kds-pill-num">${tabDel}</span>` : ''}
        </button>
        <button class="kds-pill ${state.kitchenTab === 'togo' ? 'active' : ''}" data-tab="togo">
          To Go${tabTogo ? ` <span class="kds-pill-num">${tabTogo}</span>` : ''}
        </button>
        <button class="kds-pill ${state.kitchenTab === 'dine-in' ? 'active' : ''}" data-tab="dine-in">
          Dine-In${tabDine ? ` <span class="kds-pill-num">${tabDine}</span>` : ''}
        </button>
        <span class="kds-divider"></span>
        <button class="kds-text-btn ${state.kdsBulkMode ? 'on' : ''}" id="kdsBulkToggle">
          ${state.kdsBulkMode ? 'Exit Bulk' : 'Enter Bulk'}
        </button>
        <button class="kds-text-btn warn" id="kdsMarkAll">Mark All Done</button>
        <button class="kds-icon-btn" id="kdsRefresh" aria-label="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>
        </button>
        <span class="kds-tablet-tag">
          <span>Casey's Tablet | ${timeStamp}</span>
          <span class="kds-tablet-dot"></span>
        </span>
      </div>
    </div>
    ${state.kdsBulkMode ? `
      <div class="kds-bulk-row">
        <div class="kds-bulk-left">
          <span class="kds-bulk-count">${state.kdsSelected.size} selected</span>
          <button class="kds-mini-btn ${state.kdsSelected.size === list.length && list.length > 0 ? 'active' : ''}" id="kdsSelectAll">Select All</button>
          <button class="kds-mini-btn outline" id="kdsClearSel">Clear</button>
        </div>
        <div class="kds-bulk-right">
          <button class="kds-mini-btn" id="kdsAdvanceSel" ${state.kdsSelected.size === 0 ? 'disabled' : ''}>Advance Selected</button>
          <button class="kds-mini-btn" id="kdsMarkSelDone" ${state.kdsSelected.size === 0 ? 'disabled' : ''}>Mark Selected Done</button>
          <button class="kds-mini-btn danger" id="kdsAdvanceTab">Advance All in Tab</button>
          <button class="kds-mini-btn warn" id="kdsMarkAllDone2">Mark All Done</button>
        </div>
      </div>
    ` : ''}
  `;

  // Cards
  if (list.length === 0) {
    $('#kitchenGrid').innerHTML = `<div class="kds-empty">All clear. No tickets in this view.</div>`;
  } else {
    $('#kitchenGrid').innerHTML = list.map(tk => {
      const timeStr = formatKdsTime(tk.time);
      const isToGo = /TO GO/i.test(tk.mode);
      const isDineIn = /DINE/i.test(tk.mode);
      const isDelivery = /DELIVERY/i.test(tk.mode);
      const isSelected = state.kdsSelected.has(tk.id);
      const totalQty = tk.items.reduce((s, i) => s + i.qty, 0);
      const servedQty = tk.items.filter(i => i.served).reduce((s, i) => s + i.qty, 0);
      const pct = totalQty > 0 ? Math.round(servedQty / totalQty * 100) : 0;

      const itemsHtml = tk.items.map((it, idx) => {
        const stationTag = it.station ? `<span class="kds-station-tag">[${escapeHtml(it.station)}]</span>` : '';
        const modsHtml = (it.mods || []).map(m => `<div class="kds-mod ${it.served ? 'served' : ''}">${escapeHtml(m)}</div>`).join('');
        return `
          <div class="kds-item-row ${it.served ? 'served' : ''}" data-ticket-id="${tk.id}" data-item-idx="${idx}">
            <span class="kds-qty-badge">${it.qty}</span>
            <div class="kds-item-body">
              <div class="kds-item-name">${stationTag} ${escapeHtml(it.name)}</div>
              ${modsHtml}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="kds-card-v3 ${isDineIn ? 'is-dine-in' : isDelivery ? 'is-delivery' : 'is-togo'} ${isSelected ? 'selected' : ''}" data-ticket-id="${tk.id}">
          ${state.kdsBulkMode ? `<button class="kds-check ${isSelected ? 'checked' : ''}" data-ticket-check="${tk.id}" aria-label="Select ticket">${isSelected ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>' : ''}</button>` : ''}
          <div class="kds-head-v3">
            <div class="kds-head-top">
              <div class="kds-num-v3">${tk.id.replace(/[a-z]$/, '')}</div>
              <div class="kds-time-v3">${timeStr}</div>
            </div>
            <div class="kds-head-bottom">
              <span class="kds-mode-dot"></span>
              <span class="kds-mode-v3">${tk.mode}</span>
            </div>
          </div>
          <div class="kds-body-v3">
            ${tk.table ? `<div class="kds-table-line-v3">Table ${escapeHtml(tk.table)}</div>` : ''}
            ${itemsHtml}
          </div>
          <div class="kds-progress-v3"><div class="kds-progress-fill-v3" style="width:${pct}%;"></div></div>
        </div>
      `;
    }).join('');
  }

  // Wire status / tab pills
  $$('[data-kds-status]').forEach(b => b.addEventListener('click', () => {
    state.kitchenStatus = b.dataset.kdsStatus;
    state.kdsSelected.clear();
    renderKitchen();
  }));
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    state.kitchenTab = b.dataset.tab;
    state.kdsSelected.clear();
    renderKitchen();
  }));

  // Wire bulk toggle, mark all, refresh
  $('#kdsBulkToggle').onclick = () => {
    state.kdsBulkMode = !state.kdsBulkMode;
    if (!state.kdsBulkMode) state.kdsSelected.clear();
    renderKitchen();
  };
  $('#kdsMarkAll').onclick = () => {
    if (!confirm(`Mark all ${list.length} tickets as done?`)) return;
    list.forEach(t => state.bumpedTickets.add(t.id));
    state.kdsSelected.clear();
    renderKitchen();
    toast(`${list.length} tickets marked done`);
  };
  $('#kdsRefresh').onclick = () => {
    renderKitchen();
    toast('Refreshed');
  };

  // Wire bulk row buttons (only when bulk mode is on)
  if (state.kdsBulkMode) {
    $('#kdsSelectAll').onclick = () => {
      if (state.kdsSelected.size === list.length) {
        state.kdsSelected.clear();
      } else {
        list.forEach(t => state.kdsSelected.add(t.id));
      }
      renderKitchen();
    };
    $('#kdsClearSel').onclick = () => {
      state.kdsSelected.clear();
      renderKitchen();
    };
    const advSel = $('#kdsAdvanceSel');
    if (advSel) advSel.onclick = () => {
      if (state.kdsSelected.size === 0) return;
      let n = 0;
      KITCHEN_TICKETS.forEach(t => {
        if (state.kdsSelected.has(t.id)) {
          // Advance: mark next unserved item as served
          const next = t.items.find(i => !i.served);
          if (next) { next.served = true; n++; }
        }
      });
      renderKitchen();
      toast(`Advanced ${n} item${n === 1 ? '' : 's'}`);
    };
    const markSel = $('#kdsMarkSelDone');
    if (markSel) markSel.onclick = () => {
      if (state.kdsSelected.size === 0) return;
      const n = state.kdsSelected.size;
      state.kdsSelected.forEach(id => state.bumpedTickets.add(id));
      state.kdsSelected.clear();
      renderKitchen();
      toast(`${n} ticket${n === 1 ? '' : 's'} marked done`);
    };
    $('#kdsAdvanceTab').onclick = () => {
      let n = 0;
      list.forEach(t => {
        const next = t.items.find(i => !i.served);
        if (next) { next.served = true; n++; }
      });
      renderKitchen();
      toast(`Advanced ${n} item${n === 1 ? '' : 's'} in tab`);
    };
    $('#kdsMarkAllDone2').onclick = () => {
      const n = list.length;
      list.forEach(t => state.bumpedTickets.add(t.id));
      state.kdsSelected.clear();
      renderKitchen();
      toast(`${n} tickets marked done`);
    };
  }

  // Wire ticket checkboxes (bulk mode)
  $$('[data-ticket-check]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.ticketCheck;
    if (state.kdsSelected.has(id)) state.kdsSelected.delete(id);
    else state.kdsSelected.add(id);
    renderKitchen();
  }));

  // Click a ticket card (non-bulk): cycle the card (toggle bump)
  $$('.kds-card-v3').forEach(c => c.addEventListener('click', (e) => {
    // Skip if user tapped checkbox or item row
    if (e.target.closest('[data-ticket-check]')) return;
    if (e.target.closest('[data-item-idx]')) return;
    if (state.kdsBulkMode) {
      // In bulk mode, tapping card body toggles selection too
      const id = c.dataset.ticketId;
      if (state.kdsSelected.has(id)) state.kdsSelected.delete(id);
      else state.kdsSelected.add(id);
      renderKitchen();
    } else {
      // Outside bulk mode → bump (mark done) the ticket
      bumpTicket(c.dataset.ticketId);
    }
  }));

  // Click an item row: toggle served state
  $$('[data-item-idx]').forEach(row => row.addEventListener('click', (e) => {
    e.stopPropagation();
    const tk = KITCHEN_TICKETS.find(t => t.id === row.dataset.ticketId);
    if (!tk) return;
    const it = tk.items[parseInt(row.dataset.itemIdx)];
    if (!it) return;
    it.served = !it.served;
    renderKitchen();
  }));
}

function formatKdsTime(t) {
  // For very large times (Image 13 shows 6209:17) treat the integer as minutes and decimal as seconds
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

/* ─── LOYALTY (Pass 1: Overview / Programs / Customers / Redeem) ─── */

let LOY_PROGRAMS = [];      // empty by default — matches "No loyalty programs yet"
let LOY_MEMBERS = [];       // empty by default — matches "No loyalty data yet"
let loyRedeemQuery = '';

if (!state.loyTab) state.loyTab = 'overview';

function renderLoyalty() {
  // Tab buttons
  $$('[data-loy-tab]').forEach(b => {
    const active = b.dataset.loyTab === state.loyTab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
    b.onclick = () => { state.loyTab = b.dataset.loyTab; renderLoyalty(); };
  });
  const refresh = $('#loyRefreshBtn');
  if (refresh) refresh.onclick = () => { toast('Loyalty data refreshed'); renderLoyalty(); };

  if (state.loyTab === 'overview') return renderLoyOverview();
  if (state.loyTab === 'programs') return renderLoyPrograms();
  if (state.loyTab === 'customers') return renderLoyCustomers();
  if (state.loyTab === 'redeem') return renderLoyRedeem();
}

function renderLoyOverview() {
  const totalEnrolled = LOY_MEMBERS.length;
  const avgSpend = totalEnrolled === 0 ? 0 : LOY_MEMBERS.reduce((s, m) => s + (m.lifetimeSpend || 0), 0) / totalEnrolled;
  const totalRewards = LOY_MEMBERS.reduce((s, m) => s + (m.rewardsEarned || 0), 0);

  $('#loyContent').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card-label">Total Enrolled</div>
        <div class="kpi-card-value">${totalEnrolled}</div>
        <div class="kpi-card-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Avg Lifetime Spend</div>
        <div class="kpi-card-value">$${avgSpend.toFixed(0)}</div>
        <div class="kpi-card-sub">per member</div>
        <div class="kpi-card-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Active Since</div>
        <div class="kpi-card-value">—</div>
        <div class="kpi-card-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Total Rewards</div>
        <div class="kpi-card-value">${totalRewards}</div>
        <div class="kpi-card-sub">lifetime earned</div>
        <div class="kpi-card-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/></svg>
        </div>
      </div>
    </div>
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.5 12.5L17 22l-5-3-5 3 1.5-9.5"/></svg>
      <div class="empty-state-text">No loyalty data yet</div>
    </div>
  `;
}

function renderLoyPrograms() {
  $('#loyContent').innerHTML = `
    <div class="programs-toolbar">
      <button class="programs-new-btn" id="newProgramBtn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        New Program
      </button>
    </div>
    ${LOY_PROGRAMS.length === 0 ? `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <div class="empty-state-text">No loyalty programs yet</div>
        <button class="empty-state-btn" id="createFirstProgram">Create First Program</button>
      </div>
    ` : `
      <div class="ana-section">
        <div class="ana-section-body" style="padding:0;">
          ${LOY_PROGRAMS.map((p, i) => `
            <div class="settings-row" style="padding:16px 20px;">
              <div>
                <div class="settings-row-label">${escapeHtml(p.name)}</div>
                <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${escapeHtml(p.desc)}</div>
              </div>
              <button class="toggle-sw ${p.on ? '' : 'off'}" data-prog-idx="${i}" role="switch" aria-checked="${p.on}" aria-label="${escapeHtml(p.name)}"></button>
            </div>
          `).join('')}
        </div>
      </div>
    `}
  `;

  const newBtn = $('#newProgramBtn');
  if (newBtn) newBtn.onclick = openNewProgramModal;
  const firstBtn = $('#createFirstProgram');
  if (firstBtn) firstBtn.onclick = openNewProgramModal;

  $$('[data-prog-idx]').forEach(t => t.addEventListener('click', () => {
    const i = parseInt(t.dataset.progIdx);
    LOY_PROGRAMS[i].on = !LOY_PROGRAMS[i].on;
    t.classList.toggle('off', !LOY_PROGRAMS[i].on);
    t.setAttribute('aria-checked', LOY_PROGRAMS[i].on);
    toast(LOY_PROGRAMS[i].name + (LOY_PROGRAMS[i].on ? ' enabled' : ' disabled'));
  }));
}

function openNewProgramModal() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">New Loyalty Program</h2><p class="modal-sub">Build a rewards engine for your regulars.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="progName">Program name</label><input class="form-input" type="text" id="progName" placeholder="e.g. House Rewards"></div>
      <div class="form-group"><label class="form-label" for="progDesc">Description</label><input class="form-input" type="text" id="progDesc" placeholder="Earn 1 point per $1 spent · Redeem at 100 pts"></div>
      <div class="form-group">
        <label class="form-label" for="progType">Reward type</label>
        <select class="form-input" id="progType" style="text-align:left;">
          <option value="points">Points-based</option>
          <option value="visits">Visit-based (e.g. 10th meal free)</option>
          <option value="tiered">Tiered membership</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveProgram()">Create</button>
    </div>
  `);
}

window.saveProgram = function() {
  const n = $('#progName').value.trim();
  if (!n) { toast('Program name required', true); return; }
  LOY_PROGRAMS.push({
    name: n,
    desc: $('#progDesc').value.trim() || 'Earn 1 point per $1 spent',
    type: $('#progType').value,
    on: true
  });
  closeModal(); renderLoyalty();
  toast('Program created');
};

function renderLoyCustomers() {
  $('#loyContent').innerHTML = `
    <div class="loy-search-plain">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input id="loyCustSearch" type="search" placeholder="Search name or phone…" aria-label="Search loyalty members">
    </div>

    <button class="loy-enroll-card" id="loyEnrollBtn">
      <span class="loy-enroll-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </span>
      <span class="loy-enroll-text">
        <span class="loy-enroll-title">Enroll New Customer</span>
        <span class="loy-enroll-sub">Add a customer to a loyalty program</span>
      </span>
    </button>

    ${LOY_MEMBERS.length === 0 ? `
      <div class="empty-state" style="padding:80px 20px;">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <div class="empty-state-text">No enrolled customers found</div>
      </div>
    ` : `
      <div class="ana-section">
        <div class="ana-section-body" style="padding:0;">
          ${LOY_MEMBERS.map(m => `
            <div class="status-row" style="padding:14px 20px; border-bottom:1px solid var(--slate-100);">
              <div style="display:flex; align-items:center; gap:12px;">
                <div class="cust-avatar">${escapeHtml(m.initials)}</div>
                <div>
                  <div style="font-size:13.5px; font-weight:600; color:var(--ink);">${escapeHtml(m.name)}</div>
                  <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${m.points} pts · ${m.visits} visits</div>
                </div>
              </div>
              <div style="font-size:13px; color:var(--slate-600);">$${(m.lifetimeSpend || 0).toFixed(0)} lifetime</div>
            </div>
          `).join('')}
        </div>
      </div>
    `}
  `;
  $('#loyEnrollBtn').onclick = () => openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Enroll New Customer</h2><p class="modal-sub">Add a customer to a loyalty program.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="enrollName">Full name</label><input class="form-input" id="enrollName" placeholder="e.g. Sam Rivera"></div>
      <div class="form-group"><label class="form-label" for="enrollPhone">Phone</label><input class="form-input" type="tel" id="enrollPhone" placeholder="555-555-5555"></div>
      <div class="form-group"><label class="form-label" for="enrollEmail">Email (optional)</label><input class="form-input" type="email" id="enrollEmail" placeholder="optional@example.com"></div>
      <div class="form-group"><label class="form-label">Program</label><div class="form-input" style="text-align:left; color:var(--slate-600);">House Rewards</div></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveEnrollment()">Enroll</button>
    </div>
  `);
}

window.saveEnrollment = function() {
  const name = $('#enrollName').value.trim();
  const phone = $('#enrollPhone').value.trim();
  if (!name || !phone) { toast('Name and phone required', true); return; }
  const initials = name.split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
  LOY_MEMBERS.push({ id: 'L'+Date.now(), name, initials, phone, points: 0, visits: 0, lifetimeSpend: 0, rewardsEarned: 0 });
  closeModal(); renderLoyalty();
  toast(`${name} enrolled in House Rewards`);
};

function renderLoyRedeem() {
  $('#loyContent').innerHTML = `
    <div class="loy-search-bar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input id="loyRedeemInput" type="tel" placeholder="Enter phone number to look up customer…" aria-label="Look up customer by phone" value="${escapeHtml(loyRedeemQuery)}">
    </div>
    <div id="loyRedeemResult"></div>
  `;
  const input = $('#loyRedeemInput');
  input.focus();
  input.oninput = (e) => {
    loyRedeemQuery = e.target.value;
    const q = loyRedeemQuery.replace(/\D/g, '');
    const result = $('#loyRedeemResult');
    if (q.length < 7) { result.innerHTML = ''; return; }
    const match = LOY_MEMBERS.find(m => (m.phone || '').replace(/\D/g, '').includes(q));
    if (match) {
      result.innerHTML = `
        <div class="ana-section" style="margin-top:18px;">
          <div class="ana-section-head">
            <div class="ana-section-title">${escapeHtml(match.name)}</div>
          </div>
          <div class="ana-section-body">
            <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
              <div><div class="kpi-card-label">Points</div><div style="font-size:24px; font-weight:700; color:var(--brand-500);">${match.points}</div></div>
              <div><div class="kpi-card-label">Available Rewards</div><div style="font-size:14px; color:var(--ink);">${match.availableRewards || 'None'}</div></div>
            </div>
            <button class="btn btn-primary" style="margin-top:16px;" onclick="toast('Reward redeemed'); closeModal();">Apply Reward</button>
          </div>
        </div>
      `;
    } else {
      result.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;">
          <div class="empty-state-text">No member found</div>
          <div style="font-size:12px; color:var(--slate-500); margin-top:4px;">Enroll this guest in a program at checkout</div>
        </div>
      `;
    }
  };
}

/* ─── INVENTORY ──────────────────────────────────────────────────── */

if (!state.invTab) state.invTab = 'catalog';
if (!state.invReportTab) state.invReportTab = 'on-hand';

function renderInventory() {
  // Wire sub-tabs
  $$('[data-inv-tab]').forEach(b => {
    const active = b.dataset.invTab === state.invTab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
    b.onclick = () => { state.invTab = b.dataset.invTab; renderInventory(); };
  });

  if (state.invTab === 'catalog')  return renderInvCatalog();
  if (state.invTab === 'vendors')  return renderVndVendors('#invContent');
  if (state.invTab === 'purchase') return renderInvPurchase();
  if (state.invTab === 'reports')  return renderInvReports();
}

// ─── CATALOG (Image 11) ───
function renderInvCatalog() {
  const lowItems = INVENTORY.filter(i => i.onHand <= i.threshold);
  $('#invContent').innerHTML = `
    ${lowItems.length > 0 ? `
      <button class="inv-low-banner" id="invLowBanner">
        <span style="display:inline-flex; align-items:center; gap:8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Low Stock (${lowItems.length})
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    ` : ''}
    <div class="inv-toolbar">
      <div class="inv-search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input id="invSearch" type="search" placeholder="Search..." aria-label="Search catalog">
      </div>
      <button class="inv-view-toggle" id="invListViewBtn" aria-label="List view">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </button>
      <button class="inv-add-btn" id="invAddBtn" aria-label="Add inventory item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <div class="inv-card-grid" id="invCardGrid">
      ${INVENTORY.map(i => renderInvCard(i)).join('')}
    </div>
  `;

  $('#invSearch').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $$('.inv-card').forEach(c => {
      const item = INVENTORY.find(x => x.id === c.dataset.invId);
      const match = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.vendor && item.vendor.toLowerCase().includes(q));
      c.style.display = match ? '' : 'none';
    });
  };
  $('#invAddBtn').onclick = () => toast('New inventory item — builder opens');
  $('#invListViewBtn').onclick = () => toast('Switched to list view');
  const banner = $('#invLowBanner');
  if (banner) banner.onclick = () => { state.invTab = 'reports'; state.invReportTab = 'low-stock'; renderInventory(); };
  $$('.inv-card').forEach(c => c.addEventListener('click', (e) => {
    if (e.target.closest('[data-inv-menu]')) return;
    const item = INVENTORY.find(x => x.id === c.dataset.invId);
    toast(`Open ${item.name}`);
  }));
  $$('[data-inv-menu]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = INVENTORY.find(x => x.id === b.dataset.invMenu);
    toast(`Options for ${item.name}`);
  }));
}

function renderInvCard(i) {
  const isLow = i.onHand <= i.threshold;
  return `
    <div class="inv-card ${isLow ? 'inv-card-low' : ''}" data-inv-id="${i.id}">
      <div class="inv-card-head">
        <div class="inv-card-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>
        </div>
        <button class="inv-card-menu" data-inv-menu="${i.id}" aria-label="Item menu">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
        </button>
      </div>
      <div class="inv-card-name">${escapeHtml(i.name)}</div>
      <div class="inv-card-cat">${escapeHtml(i.category)}</div>
      <div class="inv-card-stock-pill ${isLow ? 'low' : ''}">
        <div class="inv-card-stock-label">Stock</div>
        <div class="inv-card-stock-val">${i.onHand} ${i.unit}</div>
      </div>
      <div class="inv-card-foot">
        <div>
          <div class="inv-card-foot-label">Cost</div>
          <div class="inv-card-foot-val">$${i.cost.toFixed(2)}</div>
        </div>
        <div>
          <div class="inv-card-foot-label">Vendor</div>
          <div class="inv-card-foot-val">${escapeHtml(i.vendor || '—')}</div>
        </div>
      </div>
    </div>
  `;
}

// ─── PURCHASE ORDERS (Image 6) ───
function renderInvPurchase() {
  $('#invContent').innerHTML = `
    <div class="inv-po-tabs">
      <button class="inv-po-tab active">Purchase Orders</button>
      <button class="inv-po-tab">External Expenses</button>
    </div>
    <div class="inv-table-card">
      <div class="inv-table-head-row">
        <div class="inv-table-title">PURCHASE ORDERS TABLE</div>
        <div class="inv-table-results">${PURCHASE_ORDERS.length} results</div>
      </div>
      <div class="inv-po-filters">
        <div>
          <div class="inv-po-flbl">SEARCH</div>
          <div class="inv-po-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="search" placeholder="PO number, vendor, employee...">
          </div>
        </div>
        <div>
          <div class="inv-po-flbl">DATE RANGE</div>
          <div class="inv-po-search">
            <input type="text" placeholder="Select date range" id="poDateRange">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
          </div>
        </div>
        <button class="inv-po-create" id="invPoCreate">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Create PO
        </button>
      </div>
      <div class="inv-po-table">
        <div class="inv-po-thead">
          <div>PO NUMBER</div><div>VENDOR</div><div>STATUS</div><div>DATE</div><div>EMPLOYEE</div><div>QTY</div><div style="text-align:right;">TOTAL</div><div></div>
        </div>
        ${PURCHASE_ORDERS.map(po => `
          <div class="inv-po-row">
            <div class="inv-po-num">${po.id ? escapeHtml(po.id) : '<span style="color:var(--slate-400);">—</span>'}</div>
            <div>${po.vendor ? escapeHtml(po.vendor) : '<span style="color:var(--slate-400);">—</span>'}</div>
            <div><span class="inv-po-status ${po.status === 'Draft' ? 'draft' : ''}">${escapeHtml(po.status)}</span></div>
            <div>${escapeHtml(po.date)}</div>
            <div>${po.employee ? escapeHtml(po.employee) : '<span style="color:var(--slate-400);">—</span>'}</div>
            <div>${po.qty}</div>
            <div class="inv-po-total">$${po.total.toFixed(2)}</div>
            <button class="inv-po-del" data-po-del="${po.id || ''}" aria-label="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  $('#invPoCreate').onclick = () => toast('Purchase order builder opens');
  $$('[data-po-del]').forEach(b => b.addEventListener('click', () => toast('PO removed (demo only)')));
  $$('.inv-po-tab').forEach(b => b.addEventListener('click', () => {
    $$('.inv-po-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    toast(b.textContent);
  }));
}

// ─── REPORTS (Image 4 + 7) ───
function renderInvReports() {
  const reportTabs = [
    { id: 'on-hand',       label: 'On Hand',           icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>' },
    { id: 'low-stock',     label: 'Low Stock',         icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
    { id: 'sales-velocity',label: 'Sales Velocity',    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' },
    { id: 'cogs',          label: 'COGS',              icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
    { id: 'variance',      label: 'Variance',          icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="14" width="3" height="6"/><rect x="11" y="8" width="3" height="12"/><rect x="17" y="11" width="3" height="9"/></svg>' },
    { id: 'vendor-perf',   label: 'Vendor Performance',icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' }
  ];

  const pillsRow = `
    <div class="inv-rpt-pills">
      ${reportTabs.map(t => `
        <button class="inv-rpt-pill ${state.invReportTab === t.id ? 'active' : ''}" data-inv-rpt="${t.id}">
          ${t.icon}<span>${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;

  let body = '';
  if (state.invReportTab === 'on-hand') {
    const total = INVENTORY.length;
    const totalVal = INVENTORY.reduce((s, i) => s + i.cost * i.onHand, 0);
    const outOfStock = INVENTORY.filter(i => i.onHand === 0).length;
    // Top 3 most-stocked for the "on hand" view (matches Image 7 showing 3 results)
    const top = INVENTORY.slice(0, 3);
    body = `
      <div class="inv-rpt-kpis">
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">TOTAL ITEMS</div><div class="inv-rpt-kpi-val brand">${top.length}</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">TOTAL VALUE</div><div class="inv-rpt-kpi-val">$${(top.reduce((s,i)=>s+i.cost*i.onHand,0)).toFixed(2)}</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">OUT OF STOCK</div><div class="inv-rpt-kpi-val danger">${top.filter(i=>i.onHand===0).length}</div></div>
      </div>
      <div class="inv-rpt-section-head">
        <div class="inv-rpt-section-title">ON HAND TABLE</div>
        <div class="inv-rpt-section-results">${top.length} results</div>
      </div>
      <div class="inv-rpt-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="search" placeholder="Search item, category, unit...">
      </div>
      <div class="inv-rpt-table inv-rpt-onhand">
        <div class="inv-rpt-thead"><div>NAME</div><div>CATEGORY</div><div style="text-align:center;">STOCK</div><div>UNIT</div><div>COST</div><div style="text-align:right;">VALUE</div></div>
        ${top.map(i => `
          <div class="inv-rpt-row">
            <div class="inv-rpt-name"><span class="inv-rpt-dot ${i.onHand === 0 ? 'danger' : 'ok'}"></span>${escapeHtml(i.name)}</div>
            <div>${escapeHtml(i.category)}</div>
            <div class="inv-rpt-stock ${i.onHand === 0 ? 'danger' : ''}" style="text-align:center;">${i.onHand}</div>
            <div>${escapeHtml(i.unit)}</div>
            <div>$${i.cost.toFixed(2)}</div>
            <div class="inv-rpt-val ${i.onHand === 0 ? 'danger' : 'brand'}" style="text-align:right;">$${(i.cost*i.onHand).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (state.invReportTab === 'low-stock') {
    const lows = INVENTORY.filter(i => i.onHand <= i.threshold);
    const critical = lows.filter(i => i.onHand === 0).length;
    const reorderCost = lows.reduce((s,i) => s + i.cost * (i.max - i.onHand), 0);
    body = `
      <div class="inv-rpt-kpis low">
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">LOW STOCK ITEMS</div><div class="inv-rpt-kpi-val warning">${lows.length}</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">CRITICAL (QTY = 0)</div><div class="inv-rpt-kpi-val danger">${critical}</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">EST. REORDER COST</div><div class="inv-rpt-kpi-val brand">$${reorderCost.toFixed(2)}</div></div>
      </div>
      <div class="inv-rpt-section-head">
        <div class="inv-rpt-section-title">LOW STOCK TABLE</div>
        <div class="inv-rpt-section-results">${lows.length} results</div>
      </div>
      <div class="inv-rpt-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="search" placeholder="Search item, category, vendor...">
      </div>
      <div class="inv-rpt-table inv-rpt-low">
        <div class="inv-rpt-thead"><div>NAME</div><div>CATEGORY</div><div style="text-align:center;">STOCK</div><div style="text-align:center;">THRESHOLD</div><div style="text-align:right;">VENDOR</div></div>
        ${lows.length === 0 ? '<div style="padding:30px; text-align:center; color:var(--slate-500); font-size:13px;">No items are below their threshold.</div>' :
          lows.map(i => `
            <div class="inv-rpt-row">
              <div class="inv-rpt-name"><span class="inv-rpt-dot danger"></span>${escapeHtml(i.name)}</div>
              <div>${escapeHtml(i.category)}</div>
              <div class="inv-rpt-stock danger" style="text-align:center;">${i.onHand}</div>
              <div style="text-align:center;">${i.threshold}</div>
              <div style="text-align:right;">${escapeHtml(i.vendor || '—')}</div>
            </div>
          `).join('')}
      </div>
    `;
  } else if (state.invReportTab === 'sales-velocity') {
    body = `
      <div class="inv-rpt-kpis">
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">TOP MOVER (7D)</div><div class="inv-rpt-kpi-val brand">Brioche Buns</div><div class="inv-rpt-kpi-sub">48 units / day</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">SLOWEST MOVER</div><div class="inv-rpt-kpi-val">Espresso Beans</div><div class="inv-rpt-kpi-sub">0.4 units / day</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">AVG TURNOVER</div><div class="inv-rpt-kpi-val">6.2 days</div></div>
      </div>
      <div class="inv-rpt-section-head"><div class="inv-rpt-section-title">SALES VELOCITY</div><div class="inv-rpt-section-results">${INVENTORY.length} items</div></div>
      <div class="inv-rpt-table" style="grid-template-columns:2fr 1fr 1fr 1fr;">
        <div class="inv-rpt-thead"><div>ITEM</div><div style="text-align:center;">7D AVG</div><div style="text-align:center;">30D AVG</div><div style="text-align:right;">TREND</div></div>
        ${INVENTORY.slice(0, 8).map(i => {
          const v = (Math.abs(i.id.charCodeAt(2) - 48) + 1) * 0.7;
          const trend = i.onHand === 0 ? '↓' : v > 4 ? '↑' : '→';
          const trendColor = i.onHand === 0 ? 'var(--danger)' : v > 4 ? 'var(--brand-500)' : 'var(--slate-500)';
          return `
            <div class="inv-rpt-row" style="grid-template-columns:2fr 1fr 1fr 1fr;">
              <div class="inv-rpt-name">${escapeHtml(i.name)}</div>
              <div style="text-align:center;">${v.toFixed(1)} ${i.unit}/day</div>
              <div style="text-align:center;">${(v*0.85).toFixed(1)} ${i.unit}/day</div>
              <div style="text-align:right; color:${trendColor}; font-weight:700;">${trend}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (state.invReportTab === 'cogs') {
    const totalCogs = INVENTORY.reduce((s, i) => s + i.cost * (i.max - i.onHand) * 0.7, 0);
    body = `
      <div class="inv-rpt-kpis">
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">COGS (30D)</div><div class="inv-rpt-kpi-val">$${totalCogs.toFixed(2)}</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">COGS % OF REVENUE</div><div class="inv-rpt-kpi-val brand">28.4%</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">FOOD COST RATIO</div><div class="inv-rpt-kpi-val">31.2%</div></div>
      </div>
      <div class="inv-rpt-section-head"><div class="inv-rpt-section-title">COGS BY CATEGORY</div><div class="inv-rpt-section-results">6 categories</div></div>
      <div class="inv-rpt-table" style="grid-template-columns:2fr 1fr 1fr 1fr;">
        <div class="inv-rpt-thead"><div>CATEGORY</div><div style="text-align:center;">ITEMS</div><div style="text-align:center;">COST</div><div style="text-align:right;">% OF TOTAL</div></div>
        ${['Proteins','Produce','Dairy','Bakery','Beverage','Pantry'].map(cat => {
          const items = INVENTORY.filter(i => i.category === cat);
          const cost = items.reduce((s, i) => s + i.cost * i.onHand, 0);
          const pct = totalCogs > 0 ? (cost / totalCogs * 100).toFixed(1) : '0.0';
          return `
            <div class="inv-rpt-row" style="grid-template-columns:2fr 1fr 1fr 1fr;">
              <div class="inv-rpt-name">${escapeHtml(cat)}</div>
              <div style="text-align:center;">${items.length}</div>
              <div style="text-align:center;">$${cost.toFixed(2)}</div>
              <div style="text-align:right; color:var(--brand-500); font-weight:600;">${pct}%</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (state.invReportTab === 'variance') {
    body = `
      <div class="inv-rpt-kpis">
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">TOTAL VARIANCE</div><div class="inv-rpt-kpi-val danger">-$42.18</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">SHRINK %</div><div class="inv-rpt-kpi-val">2.4%</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">FLAGGED ITEMS</div><div class="inv-rpt-kpi-val warning">3</div></div>
      </div>
      <div class="inv-rpt-section-head"><div class="inv-rpt-section-title">VARIANCE TABLE</div><div class="inv-rpt-section-results">${INVENTORY.length} items</div></div>
      <div class="inv-rpt-table" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr;">
        <div class="inv-rpt-thead"><div>ITEM</div><div style="text-align:center;">EXPECTED</div><div style="text-align:center;">ACTUAL</div><div style="text-align:center;">VARIANCE</div><div style="text-align:right;">$ IMPACT</div></div>
        ${INVENTORY.slice(0, 6).map(i => {
          const expected = i.max - 5;
          const actual = i.onHand;
          const variance = actual - expected;
          const impact = variance * i.cost;
          return `
            <div class="inv-rpt-row" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr;">
              <div class="inv-rpt-name">${escapeHtml(i.name)}</div>
              <div style="text-align:center;">${expected}</div>
              <div style="text-align:center;">${actual}</div>
              <div style="text-align:center; color:${variance < 0 ? 'var(--danger)' : 'var(--brand-500)'}; font-weight:600;">${variance > 0 ? '+' : ''}${variance}</div>
              <div style="text-align:right; color:${impact < 0 ? 'var(--danger)' : 'var(--brand-500)'}; font-weight:700;">${impact >= 0 ? '+' : ''}$${impact.toFixed(2)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (state.invReportTab === 'vendor-perf') {
    body = `
      <div class="inv-rpt-kpis">
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">AVG ON-TIME RATE</div><div class="inv-rpt-kpi-val brand">94.2%</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">AVG FILL RATE</div><div class="inv-rpt-kpi-val">98.7%</div></div>
        <div class="inv-rpt-kpi"><div class="inv-rpt-kpi-lbl">TOTAL SPEND (30D)</div><div class="inv-rpt-kpi-val">$8,402.50</div></div>
      </div>
      <div class="inv-rpt-section-head"><div class="inv-rpt-section-title">VENDOR SCORECARD</div><div class="inv-rpt-section-results">${VENDORS.length} vendors</div></div>
      <div class="inv-rpt-table" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr;">
        <div class="inv-rpt-thead"><div>VENDOR</div><div style="text-align:center;">ORDERS</div><div style="text-align:center;">ON-TIME</div><div style="text-align:center;">FILL</div><div style="text-align:right;">SPEND</div></div>
        ${VENDORS.map((v, idx) => {
          const orders = (idx + 1) * 3 + 2;
          const onTime = 90 + ((idx * 13) % 9);
          const fill = 95 + ((idx * 7) % 5);
          const spend = (idx + 1) * 380 + 200;
          return `
            <div class="inv-rpt-row" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr;">
              <div class="inv-rpt-name">${escapeHtml(v.name)}</div>
              <div style="text-align:center;">${orders}</div>
              <div style="text-align:center; color:${onTime >= 95 ? 'var(--brand-500)' : 'var(--slate-700)'}; font-weight:600;">${onTime}%</div>
              <div style="text-align:center; font-weight:600;">${fill}%</div>
              <div style="text-align:right; color:var(--brand-500); font-weight:700;">$${spend.toFixed(2)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  $('#invContent').innerHTML = `${pillsRow}${body}`;
  $$('[data-inv-rpt]').forEach(b => b.addEventListener('click', () => {
    state.invReportTab = b.dataset.invRpt;
    renderInventory();
  }));
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
  // Sub-tab buttons
  $$('[data-ana-tab]').forEach(b => {
    const active = b.dataset.anaTab === state.anaTab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
    b.onclick = () => { state.anaTab = b.dataset.anaTab; renderAnalytics(); };
  });

  // Date pill + refresh
  $('#anaDateBtn').onclick = () => openAnaDatePicker();
  $('#anaRefreshBtn').onclick = () => { toast('Analytics refreshed'); renderAnalytics(); };

  if (state.anaTab === 'overview') return renderAnaOverview();
  if (state.anaTab === 'items') return renderAnaItems();
  if (state.anaTab === 'customers') return renderAnaCustomers();
  if (state.anaTab === 'staff') return renderAnaStaff();
  if (state.anaTab === 'payments') return renderAnaPayments();
}

if (!state.anaTab) state.anaTab = 'overview';
if (!state.anaDate) state.anaDate = 'May 15, 2026';
// In demo data mode, we show zeros to match the screenshots' empty dashboard
if (state.anaDemoEmpty === undefined) state.anaDemoEmpty = true;

function renderAnaOverview() {
  const empty = state.anaDemoEmpty;
  const totalOrders = empty ? 0 : 184;
  const revenue = empty ? 0 : 11860;
  const avgOrder = empty ? 0 : 64.40;
  const discounts = empty ? 0 : 142.50;
  const paid = empty ? 0 : 184;
  const voided = empty ? 0 : 2;
  const cancelled = empty ? 0 : 1;
  const tax = empty ? 0 : 1054.30;
  const tips = empty ? 0 : 1428.20;
  const sessions = empty ? 0 : 84;
  const covers = empty ? 0 : 248;
  const avgParty = empty ? 0 : 2.95;
  const avgDuration = empty ? '—' : '1h 14m';

  $('#anaContent').innerHTML = `
    <div class="ana-section">
      <div class="ana-section-head">
        <span class="ana-section-head-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
        <span class="ana-section-title">Orders</span>
      </div>
      <div class="ana-section-body">
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-card-label">Total Orders</div>
            <div class="kpi-card-value">${totalOrders}</div>
            <div class="kpi-card-sub">${paid} paid</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-label">Revenue</div>
            <div class="kpi-card-value">$${revenue.toFixed(2)}</div>
            <div class="kpi-card-sub">$${revenue.toFixed(2)}</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-label">Avg Order</div>
            <div class="kpi-card-value">$${avgOrder.toFixed(2)}</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-label">Discounts</div>
            <div class="kpi-card-value">$${discounts.toFixed(2)}</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg></div>
          </div>
        </div>
        <div class="ana-row-2" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <div class="kpi-card-label" style="margin-bottom:14px;">Status</div>
            <div class="status-list">
              <div class="status-row">
                <span class="status-row-label"><span class="status-row-dot" style="background:var(--brand-500);"></span>Paid</span>
                <span class="status-row-value">${paid} <span class="status-row-pct">${totalOrders ? Math.round(paid/totalOrders*100) : 0}%</span></span>
              </div>
              <div class="status-row">
                <span class="status-row-label"><span class="status-row-dot" style="background:var(--danger);"></span>Voided</span>
                <span class="status-row-value">${voided} <span class="status-row-pct">${totalOrders ? Math.round(voided/totalOrders*100) : 0}%</span></span>
              </div>
              <div class="status-row">
                <span class="status-row-label"><span class="status-row-dot" style="background:var(--warning);"></span>Cancelled</span>
                <span class="status-row-value">${cancelled} <span class="status-row-pct">${totalOrders ? Math.round(cancelled/totalOrders*100) : 0}%</span></span>
              </div>
            </div>
          </div>
          <div>
            <div class="kpi-card-label" style="margin-bottom:14px;">Collected</div>
            <div class="status-list">
              <div class="status-row"><span class="status-row-label">Tax</span><span style="font-size:14px; font-weight:600; color:var(--brand-500);">$${tax.toFixed(2)}</span></div>
              <div class="status-row"><span class="status-row-label">Tips</span><span style="font-size:14px; font-weight:600; color:var(--brand-500);">$${tips.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="ana-section">
      <div class="ana-section-head">
        <span class="ana-section-head-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg></span>
        <span class="ana-section-title">Table Sessions</span>
      </div>
      <div class="ana-section-body">
        <div class="kpi-grid" style="grid-template-columns:repeat(3, 1fr); margin-bottom:0;">
          <div class="kpi-card">
            <div class="kpi-card-label">Sessions</div>
            <div class="kpi-card-value">${sessions}</div>
            <div class="kpi-card-sub">${covers} covers</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-label">Avg Party</div>
            <div class="kpi-card-value">${avgParty.toFixed(1)}</div>
            <div class="kpi-card-sub">guests / session</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-label">Avg Duration</div>
            <div class="kpi-card-value">${avgDuration}</div>
            <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAnaItems() {
  const items = state.anaDemoEmpty ? [] : [
    { name: 'Cheesesteak Sandwich', qty: 214, revenue: 3635 },
    { name: 'Crispy Chicken Sandwich', qty: 198, revenue: 2077 },
    { name: 'Loaded Fries', qty: 142, revenue: 1930 },
    { name: 'Chicken Tenders', qty: 128, revenue: 1521 },
    { name: 'Smash Burger', qty: 102, revenue: 1008 }
  ];
  if (items.length === 0) {
    $('#anaContent').innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>
        <div class="empty-state-text">No item data for this period</div>
      </div>
    `;
    return;
  }
  $('#anaContent').innerHTML = `
    <div class="ana-section">
      <div class="ana-section-head"><span class="ana-section-title">Top Items</span></div>
      <div class="ana-section-body" style="padding:0;">
        ${items.map((it, i) => `
          <div class="status-row" style="padding:14px 20px;">
            <div style="display:flex; align-items:center; gap:14px;">
              <span style="font-size:11px; font-weight:700; color:var(--slate-400); letter-spacing:0.05em;">${String(i+1).padStart(2, '0')}</span>
              <div>
                <div style="font-size:13.5px; font-weight:600; color:var(--ink);">${escapeHtml(it.name)}</div>
                <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${it.qty} sold</div>
              </div>
            </div>
            <span style="font-size:13.5px; font-weight:700; color:var(--ink);">$${it.revenue.toLocaleString()}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAnaCustomers() {
  if (state.anaDemoEmpty) {
    $('#anaContent').innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div class="empty-state-text">No customer data for this period</div>
      </div>
    `;
    return;
  }
  $('#anaContent').innerHTML = `
    <div class="ana-section">
      <div class="ana-section-head"><span class="ana-section-title">Top Customers</span></div>
      <div class="ana-section-body" style="padding:0;">
        ${CUSTOMERS.slice(0, 5).map(c => `
          <div class="status-row" style="padding:14px 20px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div class="cust-avatar">${c.initials}</div>
              <div>
                <div style="font-size:13.5px; font-weight:600; color:var(--ink);">${escapeHtml(c.name)}</div>
                <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${c.visits} visits · ${c.tier} member</div>
              </div>
            </div>
            <span style="font-size:13px; font-weight:600; color:var(--brand-500);">${c.points.toLocaleString()} pts</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAnaStaff() {
  if (state.anaDemoEmpty) {
    $('#anaContent').innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <div class="empty-state-text">No staff data for this period</div>
      </div>
    `;
    return;
  }
  $('#anaContent').innerHTML = `
    <div class="ana-section">
      <div class="ana-section-head"><span class="ana-section-title">Staff Performance</span></div>
      <div class="ana-section-body" style="padding:0;">
        ${STAFF.map(s => `
          <div class="status-row" style="padding:14px 20px;">
            <div>
              <div style="font-size:13.5px; font-weight:600; color:var(--ink);">${escapeHtml(s.name)}</div>
              <div style="font-size:11.5px; color:var(--slate-500); margin-top:2px;">${s.role}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13.5px; font-weight:700; color:var(--ink);">$${(420 + Math.random()*200).toFixed(0)}</div>
              <div style="font-size:11px; color:var(--slate-500);">in tips</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAnaPayments() {
  const empty = state.anaDemoEmpty;
  $('#anaContent').innerHTML = `
    <div class="ana-section">
      <div class="ana-section-head">
        <span class="ana-section-title" style="display:inline-flex; align-items:center; gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--brand-500);"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
          Payments
        </span>
      </div>
      <div class="ana-section-body" style="padding: 18px 20px;">
        <div class="ana-pay-cards">
          <div class="ana-pay-card">
            <div class="ana-pay-card-head">
              <div class="ana-pay-card-lbl">COLLECTED</div>
              <div class="ana-pay-card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
            </div>
            <div class="ana-pay-card-val">${empty ? '$0.00' : '$11,860.00'}</div>
            <div class="ana-pay-card-sub">${empty ? '0 txns' : '218 txns'}</div>
          </div>
          <div class="ana-pay-card">
            <div class="ana-pay-card-head">
              <div class="ana-pay-card-lbl">REFUNDS</div>
              <div class="ana-pay-card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 11 17 5 11"/><line x1="11" y1="17" x2="11" y2="3"/></svg></div>
            </div>
            <div class="ana-pay-card-val">${empty ? '0' : '3'}</div>
            <div class="ana-pay-card-sub">${empty ? 'None' : '$87.40'}</div>
          </div>
        </div>
      </div>
    </div>
    ${!empty ? `
      <div class="ana-section">
        <div class="ana-section-head"><span class="ana-section-title">Payment Mix</span></div>
        <div class="ana-section-body">
          <div class="status-list">
            <div class="status-row">
              <span class="status-row-label"><span class="status-row-dot" style="background:var(--brand-500);"></span>Card</span>
              <span class="status-row-value">$8,420.60 <span class="status-row-pct">71%</span></span>
            </div>
            <div class="status-row">
              <span class="status-row-label"><span class="status-row-dot" style="background:var(--success);"></span>Cash</span>
              <span class="status-row-value">$2,609.20 <span class="status-row-pct">22%</span></span>
            </div>
            <div class="status-row">
              <span class="status-row-label"><span class="status-row-dot" style="background:var(--brand-300);"></span>Apple / Google Pay</span>
              <span class="status-row-value">$830.20 <span class="status-row-pct">7%</span></span>
            </div>
          </div>
        </div>
      </div>
      <div class="ana-section">
        <div class="ana-section-head"><span class="ana-section-title">Channel Mix</span></div>
        <div class="ana-section-body">
          <div class="status-list">
            <div class="status-row"><span class="status-row-label">Dine-In</span><span class="status-row-value">$4,981 <span class="status-row-pct">42%</span></span></div>
            <div class="status-row"><span class="status-row-label">Takeout</span><span class="status-row-value">$4,507 <span class="status-row-pct">38%</span></span></div>
            <div class="status-row"><span class="status-row-label">Delivery</span><span class="status-row-value">$2,372 <span class="status-row-pct">20%</span></span></div>
          </div>
        </div>
      </div>
    ` : ''}
  `;
}

function openAnaDatePicker() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Select Date</h2><p class="modal-sub">Choose a period for analytics.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Quick ranges</label>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;">
          <button class="btn btn-secondary" onclick="setAnaDate('Today')">Today</button>
          <button class="btn btn-secondary" onclick="setAnaDate('Yesterday')">Yesterday</button>
          <button class="btn btn-secondary" onclick="setAnaDate('Last 7 days')">Last 7 days</button>
          <button class="btn btn-secondary" onclick="setAnaDate('Last 30 days')">Last 30 days</button>
          <button class="btn btn-secondary" onclick="setAnaDate('This month')">This month</button>
          <button class="btn btn-secondary" onclick="setAnaDate('Year to date')">Year to date</button>
        </div>
      </div>
      <div class="form-group" style="border-top:1px solid var(--slate-100); padding-top:14px;">
        <label class="form-label">Demo data</label>
        <div style="display:flex; gap:8px;">
          <button class="btn ${state.anaDemoEmpty ? 'btn-primary' : 'btn-secondary'}" onclick="setAnaDemo(true)">Empty (no orders)</button>
          <button class="btn ${!state.anaDemoEmpty ? 'btn-primary' : 'btn-secondary'}" onclick="setAnaDemo(false)">With sample data</button>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}
window.setAnaDate = function(label) {
  state.anaDate = label === 'Today' ? 'May 15, 2026' : label;
  $('#anaDateLabel').textContent = state.anaDate;
  closeModal(); renderAnalytics();
  toast(`Showing: ${label}`);
};
window.setAnaDemo = function(empty) {
  state.anaDemoEmpty = empty;
  closeModal(); renderAnalytics();
  toast(empty ? 'Showing empty state' : 'Showing sample data');
};

/* ─── MENU MGMT ──────────────────────────────────────────────────── */

// Modifier groups — matches screenshot 11 (Chicken Tenders Pcs, Crepe Toppings, Extras Choices, etc)
const MODIFIER_GROUPS = [
  {
    id: 'mod-tenders', name: 'Chicken Tenders Pcs',
    scope: 'global', required: true, multi: false,
    options: [{ name: '4 pcs', delta: 0 }, { name: '6 pcs', delta: 3.00 }, { name: '8 pcs', delta: 6.00 }],
    usedBy: [{ name: 'Chicken Tenders', price: 11.89 }]
  },
  {
    id: 'mod-crepe', name: 'Crepe Toppings',
    scope: 'global', required: false, multi: true,
    options: [
      { name: 'Nutella', delta: 0 }, { name: 'Powdered Sugar', delta: 0 },
      { name: 'Pistachio Sauce', delta: 0 }, { name: 'Kanafi Pastry', delta: 0 },
      { name: 'Milk Chocolate Drizzle', delta: 0 }, { name: '+9 more', delta: null }
    ],
    usedBy: [
      { name: 'Dubai Crepe', price: 12.49 }, { name: 'Lotus Biscoff Crepe', price: 10.39 },
      { name: 'Oreo Crepe', price: 8.99 }, { name: 'Original Crepe', price: 8.49 },
      { name: "S'Mores Crepe", price: 9.29 }, { name: 'Strawberry Banana Crepe', price: 9.89 }
    ]
  },
  {
    id: 'mod-extras', name: 'Extras Choices',
    scope: 'global', required: true, multi: true,
    options: [{ name: 'Coleslaw', delta: 2.89 }, { name: '3 Pickles', delta: 1.89 }],
    usedBy: []
  },
  {
    id: 'mod-cheese', name: 'Cheese Selection',
    scope: 'global', required: false, multi: false,
    options: [{ name: 'American', delta: 0 }, { name: 'Cheddar', delta: 0.50 }, { name: 'Pepper Jack', delta: 0.75 }, { name: 'Swiss', delta: 0.50 }],
    usedBy: []
  },
  {
    id: 'mod-temp', name: 'Cooking Temperature',
    scope: 'global', required: true, multi: false,
    options: [{ name: 'Medium Rare', delta: 0 }, { name: 'Medium', delta: 0 }, { name: 'Medium Well', delta: 0 }, { name: 'Well Done', delta: 0 }],
    usedBy: []
  },
  {
    id: 'mod-size', name: 'Drink Size',
    scope: 'global', required: true, multi: false,
    options: [{ name: 'Small', delta: 0 }, { name: 'Medium', delta: 0.99 }, { name: 'Large', delta: 1.99 }],
    usedBy: []
  },
];

// Schedules — placeholder for menu schedules (lunch/dinner/all-day)
const MENU_SCHEDULES = [
  { id: 'sched-allday', name: 'All Day',     active: true,  start: '00:00', end: '23:59', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
  { id: 'sched-lunch',  name: 'Lunch Menu',  active: false, start: '11:00', end: '15:00', days: ['Mon','Tue','Wed','Thu','Fri'] },
  { id: 'sched-dinner', name: 'Dinner Menu', active: false, start: '17:00', end: '22:00', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] }
];

// Menus container — supports one parent "Standard Menu"
const MENUS = [
  { id: 'menu-saucy', name: 'Standard Menu', categories: MENU_CATEGORIES.length, active: true }
];

if (!state.mmSection) state.mmSection = 'modifiers';   // default to modifier groups (matches screenshot 11)
if (!state.mmOpenRow) state.mmOpenRow = null;

function renderMenuMgmt() {
  // Left nav
  const navItems = [
    { id: 'menus',      name: 'Menus',      count: MENUS.length,           icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
    { id: 'categories', name: 'Categories', count: MENU_CATEGORIES.length, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>' },
    { id: 'items',      name: 'Items',      count: MENU_ITEMS.length,      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>' },
    { id: 'modifiers',  name: 'Modifiers',  count: MODIFIER_GROUPS.length, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>' },
    { id: 'schedules',  name: 'Schedules',  count: null,                   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  ];
  $('#mmNavList').innerHTML = navItems.map(it => `
    <button class="mm-nav-item ${state.mmSection === it.id ? 'active' : ''}" data-mm-section="${it.id}" role="tab" aria-selected="${state.mmSection === it.id}">
      ${it.icon}
      <span>${it.name}</span>
      ${it.count !== null ? `<span class="mm-nav-count">${it.count}</span>` : ''}
    </button>
  `).join('');

  $$('[data-mm-section]').forEach(b => b.onclick = () => {
    state.mmSection = b.dataset.mmSection;
    state.mmOpenRow = null;
    renderMenuMgmt();
  });

  $('#mmNavAddBtn').onclick = () => {
    const labels = { menus: 'menu', categories: 'category', items: 'item', modifiers: 'modifier group', schedules: 'schedule' };
    toast(`New ${labels[state.mmSection] || 'item'} — opening builder`);
  };

  // Render the active section into mm-main
  if (state.mmSection === 'menus')      return renderMmMenus();
  if (state.mmSection === 'categories') return renderMmCategories();
  if (state.mmSection === 'items')      return renderMmItems();
  if (state.mmSection === 'modifiers')  return renderMmModifiers();
  if (state.mmSection === 'schedules')  return renderMmSchedules();
}

function renderMmSectionHead(title, addLabel) {
  return `
    <div class="mm-section-head">
      <h3 class="mm-section-title">${escapeHtml(title)}</h3>
      <div class="mm-section-actions">
        <button class="mm-icon-btn" id="mmRefreshBtn" aria-label="Refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg></button>
        <button class="mm-icon-btn" id="mmSearchBtn" aria-label="Search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></button>
        <button class="mm-section-add" id="mmAddBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>${escapeHtml(addLabel)}
        </button>
      </div>
    </div>
  `;
}

function wireMmSectionHead(addClickHandler) {
  $('#mmRefreshBtn').onclick = () => toast('Refreshed');
  $('#mmSearchBtn').onclick = () => toast('Search coming soon');
  $('#mmAddBtn').onclick = addClickHandler || (() => toast('Add — opening builder'));
}

function renderMmMenus() {
  $('#mmMain').innerHTML = `
    ${renderMmSectionHead(`Menus (${MENUS.length})`, '+ Add Menu')}
    ${MENUS.map(m => `
      <div class="mm-row mm-menu-row" data-menu-id="${m.id}">
        <div class="mm-row-head">
          <span class="mm-drag-handle" aria-hidden="true">
            <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="7" r="1.3"/><circle cx="9" cy="7" r="1.3"/><circle cx="3" cy="11" r="1.3"/><circle cx="9" cy="11" r="1.3"/></svg>
          </span>
          <div class="mm-row-name">${escapeHtml(m.name)}</div>
          <span class="mm-badge active">Available</span>
          <div class="mm-row-actions">
            <button class="mm-row-icon-btn" aria-label="Hide menu" data-act="hide-${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg></button>
            <button class="mm-row-icon-btn" aria-label="Toggle active" data-act="toggle-${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
            <button class="mm-row-icon-btn" aria-label="Edit menu" data-act="edit-${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="mm-row-icon-btn" aria-label="Expand" data-act="expand-${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
          </div>
        </div>
      </div>
    `).join('')}
  `;
  wireMmSectionHead(() => toast('New menu — builder opens'));
  $$('[data-act]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const [action] = b.dataset.act.split('-');
    if (action === 'hide')   toast('Menu hidden from POS');
    if (action === 'toggle') toast('Menu deactivated');
    if (action === 'edit')   toast('Edit menu opens');
    if (action === 'expand') toast('Expanding menu structure');
  }));
}

function renderMmCategories() {
  $('#mmMain').innerHTML = `
    ${renderMmSectionHead(`Categories (${MENU_CATEGORIES.length})`, '+ Add Category')}
    ${MENU_CATEGORIES.map(c => {
      const itemCount = MENU_ITEMS.filter(m => m.cat === c.id).length;
      return `
        <div class="mm-row" data-row-id="${c.id}">
          <div class="mm-row-head" data-toggle-row="${c.id}">
            <svg class="mm-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            <div class="mm-row-name">${escapeHtml(c.name)}</div>
            <span class="mm-row-count">${itemCount}</span>
            <span class="mm-badge active">Active</span>
            <div class="mm-row-actions">
              <button class="mm-row-icon-btn" aria-label="Visibility" data-act="visibility"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <button class="mm-row-icon-btn" aria-label="Edit" data-act="edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
  wireMmSectionHead(() => toast('New category — builder opens'));
  $$('[data-act]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    toast(b.dataset.act === 'visibility' ? 'Visibility toggled' : 'Edit opens');
  }));
}

function renderMmItems() {
  // Group items by category and additionally show them as an A-Z grouped grid (Image 5)
  const grouped = {};
  MENU_ITEMS.forEach(it => {
    const letter = it.name.trim().charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(it);
  });
  const letters = Object.keys(grouped).sort();

  $('#mmMain').innerHTML = `
    ${renderMmSectionHead(`Menu Items (${MENU_ITEMS.length})`, '+ Add Item')}
    ${letters.map(letter => `
      <div class="mm-az-letter">${letter}</div>
      <div class="mm-items-grid">
        ${grouped[letter].sort((a,b) => a.name.localeCompare(b.name)).map(it => `
          <div class="mm-item-card" data-item-id="${it.id}">
            ${it.img ? `
              <div class="mm-item-image" style="background-image: url('${escapeHtml(it.img)}'); background-size: cover; background-position: center;">
                <div class="mm-item-overlay-icon" style="background:rgba(0,0,0,0.6); width:48px; height:48px; border-radius:50%; display:grid; place-items:center; color:white; opacity:0.85;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="11" cy="11" r="8" stroke-opacity="0"/>
                  </svg>
                </div>
              </div>
            ` : `
              <div class="menu-card-image-branded">
                <span class="menu-card-brand-mark">Maple &amp; Vine</span>
              </div>
            `}
            <div class="mm-item-info">
              <div class="mm-item-name">${escapeHtml(it.name)}</div>
              <div class="mm-item-price">${fmt(it.price)}</div>
              <div class="mm-item-actions">
                <button class="mm-item-action" data-view-item="${it.id}" aria-label="View ${escapeHtml(it.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="mm-item-action" data-edit-item="${it.id}" aria-label="Edit ${escapeHtml(it.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('')}
  `;
  wireMmSectionHead(() => toast('New item — builder opens'));
  $$('[data-view-item]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const it = MENU_ITEMS.find(m => m.id === b.dataset.viewItem);
    toast(`View ${it.name}`);
  }));
  $$('[data-edit-item]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const it = MENU_ITEMS.find(m => m.id === b.dataset.editItem);
    toast(`Edit ${it.name}`);
  }));
}

function renderMmModifiers() {
  $('#mmMain').innerHTML = `
    ${renderMmSectionHead(`Modifier Groups (${MODIFIER_GROUPS.length})`, '+ Add Modifier')}
    ${MODIFIER_GROUPS.map(g => `
      <div class="mm-row ${state.mmOpenRow === g.id ? 'open' : ''}" data-row-id="${g.id}">
        <div class="mm-row-head" data-toggle-row="${g.id}">
          <div class="mm-row-name">${escapeHtml(g.name)}</div>
          <span class="mm-badge global">Global</span>
          ${g.required ? '<span class="mm-badge required">Required</span>' : '<span class="mm-badge optional">Optional</span>'}
          <span class="mm-badge multi">${g.multi ? 'Multi' : 'Single'}</span>
          <div class="mm-row-actions">
            <button class="mm-row-icon-btn" aria-label="Edit" data-act="edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          </div>
        </div>
        <div class="mm-row-body">
          <div class="mm-section-label-row" style="margin-top:0;">Options (${g.options.length})</div>
          <div class="mm-pill-row">
            ${g.options.map(o => `<span class="mm-pill">${escapeHtml(o.name)}${o.delta > 0 ? ` <span class="mm-pill-cost">(+$${o.delta.toFixed(2)})</span>` : ''}</span>`).join('')}
          </div>
          ${g.usedBy.length > 0 ? `
            <div class="mm-section-label-row">Used by (${g.usedBy.length})</div>
            <div class="mm-used-by">
              ${g.usedBy.map(u => `
                <div class="mm-used-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                  <span>${escapeHtml(u.name)}</span>
                  <span class="mm-used-chip-price">$${u.price.toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          ` : `<div style="font-size:12px; color:var(--slate-500); margin-top:10px; font-style:italic;">Not yet attached to any item.</div>`}
        </div>
      </div>
    `).join('')}
  `;
  wireMmSectionHead(() => toast('New modifier group — builder opens'));
  $$('[data-toggle-row]').forEach(r => r.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]')) return;
    const id = r.dataset.toggleRow;
    state.mmOpenRow = state.mmOpenRow === id ? null : id;
    renderMenuMgmt();
  }));
  $$('[data-act]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    toast('Modifier editor opens');
  }));
}

if (!state.mmSchedTab) state.mmSchedTab = 'menus';

function renderMmSchedules() {
  $('#mmMain').innerHTML = `
    <div class="mm-section-head">
      <h3 class="mm-section-title">Schedules</h3>
      <div class="mm-sched-toggle">
        <button class="mm-sched-toggle-btn ${state.mmSchedTab === 'menus' ? 'active' : ''}" data-sched-tab="menus">Menus</button>
        <button class="mm-sched-toggle-btn ${state.mmSchedTab === 'categories' ? 'active' : ''}" data-sched-tab="categories">Categories</button>
      </div>
    </div>
    ${state.mmSchedTab === 'menus' ? `
      ${MENUS.map(m => `
        <div class="mm-sched-card">
          <div class="mm-sched-card-head">
            <div class="mm-sched-card-name">${escapeHtml(m.name)}</div>
            <span class="mm-badge active">Available</span>
          </div>
          <div class="mm-sched-card-sub">Always available (no schedule rules)</div>
          <button class="mm-sched-edit-btn" disabled>Edit Schedules</button>
        </div>
      `).join('')}
    ` : `
      ${MENU_CATEGORIES.map(c => `
        <div class="mm-sched-card">
          <div class="mm-sched-card-head">
            <div class="mm-sched-card-name">${escapeHtml(c.name)}</div>
            <span class="mm-badge active">Available</span>
          </div>
          <div class="mm-sched-card-sub">Always available (no schedule rules)</div>
          <button class="mm-sched-edit-btn">Edit Schedules</button>
        </div>
      `).join('')}
    `}
  `;
  $$('[data-sched-tab]').forEach(b => b.addEventListener('click', () => {
    state.mmSchedTab = b.dataset.schedTab;
    renderMenuMgmt();
  }));
  $$('.mm-sched-edit-btn:not([disabled])').forEach(b => b.addEventListener('click', () => toast('Schedule editor opens')));
}

window.addMenuItem = function() {
  const n = $('#newItemName').value.trim();
  const p = parseFloat($('#newItemPrice').value);
  const c = parseFloat($('#newItemCash').value);
  if (!n || isNaN(p) || isNaN(c)) { toast('Please fill all fields', true); return; }
  const newId = 'M' + String(Date.now()).slice(-4);
  MENU_ITEMS.push({ id: newId, cat: state.mgmtCat || 'sandwiches', name: n, price: p, cash: c, stock: 'good' });
  closeModal(); renderMenuMgmt();
  toast(`${n} added`);
};

/* ─── VENDORS ────────────────────────────────────────────────────── */

// Vendors data — primary vendor from Image 6 + supporting vendors
const VENDORS = [
  { id: 'v1', name: 'Pat Lafrieda',         contact: 'Bob',        email: 'support@plmeats.example',     phone: '5555117583' },
  { id: 'v2', name: 'Jetro Wholesale',      contact: 'Jimmy C.',   email: 'jimmyc@jetrowholesale.example',phone: '5558007553' },
  { id: 'v3', name: 'Riverview Bakery',     contact: 'Mira Park',  email: 'orders@riverviewbakery.example',phone: '5552130442' },
  { id: 'v4', name: 'Oakwood Produce',      contact: 'Theo Diaz',  email: 'theo@oakwoodproduce.example',  phone: '5557789012' },
  { id: 'v5', name: 'Northgate Dairy',      contact: 'Lena Cho',   email: 'sales@northgatedairy.example', phone: '5553318877' },
  { id: 'v6', name: 'Cascade Roasters',     contact: 'Ari Reed',   email: 'wholesale@cascaderoasters.example', phone: '5554440099' },
  { id: 'v7', name: 'Stonebridge Foods',    contact: 'Quinn Park', email: 'orders@stonebridgefoods.example', phone: '5552255600' },
];

// Purchase orders — matches Image 6 layout
const PURCHASE_ORDERS = [
  { id: 'PO-2026-05-004', vendor: 'Pat Lafrieda',  status: 'Pending Delivery', date: '5/14/2026', employee: 'Casey Walker', qty: 20, total: 37.60 },
  { id: 'PO-2026-05-003', vendor: 'Pat Lafrieda',  status: 'Pending Delivery', date: '5/14/2026', employee: 'Casey Walker', qty: 1,  total: 1.88 },
  { id: 'PO-2026-05-002', vendor: 'Pat Lafrieda',  status: 'Pending Delivery', date: '5/7/2026',  employee: null,           qty: 1,  total: 2.46 },
  { id: 'PO-2026-05-001', vendor: 'Pat Lafrieda',  status: 'Pending Delivery', date: '5/7/2026',  employee: null,           qty: 2,  total: 4.34 },
  { id: null,             vendor: null,            status: 'Draft',            date: '4/14/2026', employee: null,           qty: 11, total: 27.06 }
];

if (!state.vndTab) state.vndTab = 'vendors';

function renderVendors() {
  $$('[data-vnd-tab]').forEach(b => {
    const active = b.dataset.vndTab === state.vndTab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
    b.onclick = () => { state.vndTab = b.dataset.vndTab; renderVendors(); };
  });

  if (state.vndTab === 'catalog')  return renderVndCatalog();
  if (state.vndTab === 'vendors')  return renderVndVendors();
  if (state.vndTab === 'purchase') return renderVndPurchase();
  if (state.vndTab === 'reports')  return renderVndReports();
}

function renderVndCatalog() {
  $('#vndContent').innerHTML = `
    <div class="vnd-toolbar">
      <div class="vnd-search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="search" placeholder="Search catalog items…" aria-label="Search catalog">
      </div>
      <button class="vnd-add-btn" id="vndCatalogAdd" aria-label="Add catalog item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>
      <div class="empty-state-text">No catalog items yet</div>
      <div style="font-size:12px; color:var(--slate-500); margin-top:4px;">Add ingredients and supplies you order from vendors</div>
      <button class="empty-state-btn" onclick="toast('Catalog builder opens')">Add First Item</button>
    </div>
  `;
  const a = $('#vndCatalogAdd'); if (a) a.onclick = () => toast('Catalog builder opens');
}

function renderVndVendors(target) {
  const targetSel = target || '#vndContent';
  $(targetSel).innerHTML = `
    <div class="vnd-toolbar">
      <div class="vnd-search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input id="vndSearch" type="search" placeholder="Search vendors…" aria-label="Search vendors">
      </div>
      <button class="vnd-add-btn" id="vndAddBtn" aria-label="Add vendor">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <div class="vnd-grid" id="vndGrid">
      ${VENDORS.map(v => `
        <div class="vnd-card" data-vendor-id="${v.id}">
          <div class="vnd-card-head">
            <div class="vnd-card-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="18" rx="1"/><path d="M9 22v-6h6v6M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/></svg>
            </div>
            <div class="vnd-card-name">${escapeHtml(v.name)}</div>
            <button class="vnd-card-menu" aria-label="Vendor menu" data-vendor-menu="${v.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
            </button>
          </div>
          <div class="vnd-card-rows">
            <div class="vnd-card-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>${escapeHtml(v.contact)}</span>
            </div>
            <div class="vnd-card-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span>${escapeHtml(v.email)}</span>
            </div>
            <div class="vnd-card-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>${escapeHtml(v.phone)}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  $('#vndAddBtn').onclick = openNewVendorModal;
  $('#vndSearch').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $$('.vnd-card').forEach(c => {
      const v = VENDORS.find(x => x.id === c.dataset.vendorId);
      const match = !q || v.name.toLowerCase().includes(q) || v.contact.toLowerCase().includes(q) || v.email.toLowerCase().includes(q);
      c.style.display = match ? '' : 'none';
    });
  };
  $$('[data-vendor-menu]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const v = VENDORS.find(x => x.id === b.dataset.vendorMenu);
    toast(`Options for ${v.name}`);
  }));
  $$('.vnd-card').forEach(c => c.addEventListener('click', () => {
    const v = VENDORS.find(x => x.id === c.dataset.vendorId);
    toast(`Open ${v.name}`);
  }));
}

function openNewVendorModal() {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">New Vendor</h2><p class="modal-sub">Add a supplier or distributor.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="vndName">Vendor name</label><input class="form-input" id="vndName" placeholder="e.g. Sysco"></div>
      <div class="form-group"><label class="form-label" for="vndContact">Contact person</label><input class="form-input" id="vndContact" placeholder="e.g. Alex Rivera"></div>
      <div class="form-group"><label class="form-label" for="vndEmail">Email</label><input class="form-input" type="email" id="vndEmail" placeholder="contact@vendor.com"></div>
      <div class="form-group"><label class="form-label" for="vndPhone">Phone</label><input class="form-input" type="tel" id="vndPhone" placeholder="555-555-5555"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewVendor()">Add Vendor</button>
    </div>
  `);
}

window.saveNewVendor = function() {
  const name = $('#vndName').value.trim();
  const contact = $('#vndContact').value.trim();
  const email = $('#vndEmail').value.trim();
  const phone = $('#vndPhone').value.trim();
  if (!name) { toast('Vendor name required', true); return; }
  VENDORS.push({ id: 'v' + Date.now(), name, contact, email, phone });
  closeModal(); renderVendors();
  toast(`${name} added`);
};

function renderVndPurchase() {
  $('#vndContent').innerHTML = `
    <div class="vnd-toolbar">
      <div class="vnd-search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="search" placeholder="Search purchase orders…" aria-label="Search purchase orders">
      </div>
      <button class="vnd-add-btn" id="vndPoAdd" aria-label="Create purchase order">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    ${PURCHASE_ORDERS.length === 0 ? `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        <div class="empty-state-text">No purchase orders yet</div>
        <div style="font-size:12px; color:var(--slate-500); margin-top:4px;">Create one to track what's on order from each vendor</div>
        <button class="empty-state-btn" onclick="toast('Purchase order builder opens')">Create First PO</button>
      </div>
    ` : ''}
  `;
  const a = $('#vndPoAdd'); if (a) a.onclick = () => toast('Purchase order builder opens');
}

function renderVndReports() {
  $('#vndContent').innerHTML = `
    <div class="kpi-grid" style="margin-top:18px;">
      <div class="kpi-card">
        <div class="kpi-card-label">Total Vendors</div>
        <div class="kpi-card-value">${VENDORS.length}</div>
        <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="18" rx="1"/></svg></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Open POs</div>
        <div class="kpi-card-value">0</div>
        <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Spend (30d)</div>
        <div class="kpi-card-value">$0.00</div>
        <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Avg Lead Time</div>
        <div class="kpi-card-value">—</div>
        <div class="kpi-card-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      </div>
    </div>
    <div class="empty-state" style="margin-top:24px;">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 20h18"/><rect x="5" y="10" width="3" height="10"/><rect x="11" y="6" width="3" height="14"/><rect x="17" y="13" width="3" height="7"/></svg>
      <div class="empty-state-text">No report data yet</div>
      <div style="font-size:12px; color:var(--slate-500); margin-top:4px;">Reports populate after your first purchase order</div>
    </div>
  `;
}

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

// Settings groups — matches the left sidebar in screenshots 7, 8, 13, 16, 17, 20
const SETTINGS_GROUPS = [
  {
    id: 'ops', label: 'OPERATIONS & HARDWARE', expanded: true,
    panes: [
      { id: 'devices',    name: 'Devices & Connections', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>' },
      { id: 'printKds',   name: 'Print & KDS Config',    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' },
      { id: 'receiptTpl', name: 'Receipt Templates',     icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>' },
      { id: 'cashMgmt',   name: 'Cash Management',       icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-2.5-2.5h-1A2.5 2.5 0 0 0 9 9.5c0 1.4 1 2 2.5 2.5s2.5 1.1 2.5 2.5a2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 8 14.5"/></svg>' },
      { id: 'fraud',      name: 'Fraud Detection',       icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
      { id: 'diningRoom', name: 'Dining Room',           icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
      { id: 'customerDisplay', name: 'Customer Display', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
      { id: 'orderLine',  name: 'Order Line',            icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
      { id: 'notifications', name: 'Notifications',      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' }
    ]
  },
  {
    id: 'biz', label: 'BUSINESS MANAGEMENT', expanded: false,
    panes: [
      { id: 'business',     name: 'Business Profile', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>' },
      { id: 'payments',     name: 'Payments',         icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/></svg>' },
      { id: 'tax',          name: 'Tax & Service',    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 15h.01M16 8l-8 8"/></svg>' },
      { id: 'staff',        name: 'Staff & Roles',    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' },
      { id: 'integrations', name: 'Integrations',     icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>' },
      { id: 'audit',        name: 'Audit Log',        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' }
    ]
  },
  {
    id: 'cx', label: 'CUSTOMER EXPERIENCE', expanded: false,
    panes: [
      { id: 'cxLoyalty',    name: 'Loyalty Program',  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/></svg>' },
      { id: 'cxMessaging',  name: 'Messaging',        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
      { id: 'cxFeedback',   name: 'Reviews & Feedback', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' }
    ]
  }
];

if (!state.settingsGroupsOpen) state.settingsGroupsOpen = { ops: true, biz: false, cx: false };

function renderSettings() {
  // Sidebar — grouped sections + version footer
  $('#settingsNav').innerHTML = `
    ${SETTINGS_GROUPS.map(g => `
      <button class="set-group-head" data-set-group="${g.id}" aria-expanded="${state.settingsGroupsOpen[g.id]}">
        <span>${g.label}</span>
        <svg class="set-group-chev ${state.settingsGroupsOpen[g.id] ? '' : 'collapsed'}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="set-group-body ${state.settingsGroupsOpen[g.id] ? '' : 'collapsed'}">
        ${g.panes.map(p => `
          <button class="settings-nav-item ${p.id === state.settingsPane ? 'active' : ''}" data-pane="${p.id}" aria-current="${p.id === state.settingsPane ? 'true' : 'false'}">
            ${p.icon}<span>${p.name}</span>
          </button>
        `).join('')}
      </div>
    `).join('')}
    <div class="set-version-card">
      <div class="set-version-title">Version 2.0.0</div>
      <div class="set-version-sub">Tap to check for updates</div>
      <div class="set-version-build">019e22c8</div>
    </div>
  `;

  $('#settingsContent').innerHTML = renderSettingsPane(state.settingsPane);

  // Group expand/collapse
  $$('[data-set-group]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.setGroup;
    state.settingsGroupsOpen[id] = !state.settingsGroupsOpen[id];
    renderSettings();
  }));

  $$('[data-pane]').forEach(b => b.addEventListener('click', () => {
    state.settingsPane = b.dataset.pane;
    renderSettings();
  }));

  // Wire toggles
  $$('#settingsContent [data-toggle]').forEach(t => t.addEventListener('click', () => {
    const path = t.dataset.toggle.split('.');
    let obj = SETTINGS;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = !obj[path[path.length - 1]];
    t.classList.toggle('off', !obj[path[path.length - 1]]);
    t.setAttribute('aria-checked', obj[path[path.length - 1]]);
    toast('Setting updated');
  }));

  // Wire inputs (text/number)
  $$('#settingsContent [data-input]').forEach(inp => inp.addEventListener('change', () => {
    const path = inp.dataset.input.split('.');
    let obj = SETTINGS;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    const val = inp.type === 'number' ? parseFloat(inp.value) : inp.value;
    obj[path[path.length - 1]] = val;
    toast('Saved');
  }));

  // Wire pane-specific sub-tabs (e.g. Print & KDS Config tabs)
  $$('#settingsContent [data-sub-tab]').forEach(b => b.addEventListener('click', () => {
    state.settingsSubTab = b.dataset.subTab;
    renderSettings();
  }));

  // Wire radio-group cards (e.g. Order visibility, Customer Display layout)
  $$('#settingsContent [data-radio]').forEach(c => c.addEventListener('click', () => {
    const [path, value] = c.dataset.radio.split('=');
    const segs = path.split('.');
    let obj = SETTINGS;
    for (let i = 0; i < segs.length - 1; i++) obj = obj[segs[i]];
    obj[segs[segs.length - 1]] = value;
    toast('Saved');
    renderSettings();
  }));

  // Wire sound dropdowns + previews (Notifications)
  $$('#settingsContent [data-sound-key]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.soundKey;
    const opts = ['Bell', 'Ding', 'Alert', 'Chime', 'Buzz', 'Knock'];
    const cur = SETTINGS.notif.sounds[key];
    const idx = opts.indexOf(cur);
    SETTINGS.notif.sounds[key] = opts[(idx + 1) % opts.length];
    toast(`Sound set to ${SETTINGS.notif.sounds[key]}`);
    renderSettings();
  }));
  $$('#settingsContent [data-sound-play]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.soundPlay;
    toast(`▸ Previewing ${SETTINGS.notif.sounds[key]}`);
  }));

  // Wire devices payment terminal buttons
  const termTest = $('#termTestBtn');
  if (termTest) {
    const updateTestBtn = () => {
      const ip = $('#termIp');
      const port = $('#termPort');
      termTest.disabled = !ip.value.trim() || !port.value.trim();
    };
    const ip = $('#termIp'); const port = $('#termPort');
    if (ip) ip.oninput = updateTestBtn;
    if (port) port.oninput = updateTestBtn;
    updateTestBtn();
    termTest.onclick = () => toast('✓ Connection test successful');
  }
  const termAssign = $('#termAssign'); if (termAssign) termAssign.onclick = () => toast('Choose an existing terminal to assign');
  const termRegister = $('#termRegister'); if (termRegister) termRegister.onclick = () => toast('Register a new payment terminal');
}

function renderToggleRow(path, label, sub) {
  const segs = path.split('.');
  let obj = SETTINGS;
  for (const s of segs) obj = obj[s];
  return `
    <div class="set-card-row">
      <div>
        <div class="set-row-label">${escapeHtml(label)}</div>
        ${sub ? `<div class="set-row-sub">${escapeHtml(sub)}</div>` : ''}
      </div>
      <button class="toggle-sw ${obj ? '' : 'off'}" data-toggle="${path}" role="switch" aria-checked="${obj}" aria-label="${escapeHtml(label)}"></button>
    </div>
  `;
}

function renderRadioRow(path, value, label, sub) {
  const segs = path.split('.');
  let obj = SETTINGS;
  for (const s of segs) obj = obj[s];
  const active = obj === value;
  return `
    <button class="set-radio-row ${active ? 'active' : ''}" data-radio="${path}=${value}">
      <div>
        <div class="set-row-label">${escapeHtml(label)}</div>
        ${sub ? `<div class="set-row-sub">${escapeHtml(sub)}</div>` : ''}
      </div>
      <span class="set-radio-dot ${active ? 'on' : ''}" aria-hidden="true">
        ${active ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>' : ''}
      </span>
    </button>
  `;
}

function renderSoundRow(key, label, sub, icon) {
  const current = SETTINGS.notif.sounds[key] || 'Bell';
  return `
    <div class="dev-sound-row">
      <span class="dev-sound-icon">${icon}</span>
      <div class="dev-sound-text">
        <div class="dev-sound-name">${escapeHtml(label)}</div>
        <div class="dev-sound-desc">${escapeHtml(sub)}</div>
      </div>
      <div class="dev-sound-actions">
        <button class="dev-sound-select" data-sound-key="${key}">
          <span>${escapeHtml(current)}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <button class="dev-sound-play" data-sound-play="${key}" aria-label="Preview sound">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
      </div>
    </div>
  `;
}

function renderSettingsPane(pane) {
  // ─── DEVICES & CONNECTIONS ───
  if (pane === 'devices') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Devices &amp; Connections</h3>
        <p class="set-pane-desc">Station hardware, terminal, and printer management.</p>
      </div>

      <!-- This Station -->
      <button class="set-collapsible-head" data-collapse="this-station" style="margin-bottom:0; border-bottom:none; border-radius:12px 12px 0 0;">
        <span style="display:inline-flex; align-items:center; gap:9px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          This Station
        </span>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="set-pane-refresh" aria-label="Refresh" style="width:28px; height:28px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/></svg></button>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15l6-6 6 6"/></svg>
        </div>
      </button>
      <div class="dev-station-card">
        <div class="dev-station-model">samsung SM-X238U</div>
        <div class="dev-stat-grid">
          <div class="dev-stat-tile"><div class="dev-stat-lbl">BATTERY</div><div class="dev-stat-val">43%</div></div>
          <div class="dev-stat-tile"><div class="dev-stat-lbl">NETWORK</div><div class="dev-stat-val">cellular</div></div>
          <div class="dev-stat-tile"><div class="dev-stat-lbl">IP</div><div class="dev-stat-val">0.0.0.0</div></div>
          <div class="dev-stat-tile"><div class="dev-stat-lbl">VERSION</div><div class="dev-stat-val">2.0.0</div></div>
        </div>
      </div>

      <!-- Payment Terminal -->
      <button class="set-collapsible-head" data-collapse="terminal">
        <span style="display:inline-flex; align-items:center; gap:9px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c4-4 16-4 20 0"/><path d="M5 15c2.7-2.7 11.3-2.7 14 0"/><path d="M8.5 18c1.4-1.4 5.6-1.4 7 0"/><circle cx="12" cy="20" r="1"/></svg>
          Payment Terminal
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15l6-6 6 6"/></svg>
      </button>
      <div class="set-card-inset" style="margin-top:0;">
        <div style="font-size:13px; font-weight:600; color:var(--ink); margin-bottom:10px; display:inline-flex; align-items:center; gap:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--brand-500);"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          Quick Connect Test
        </div>
        <div class="dev-conn-fields">
          <input class="set-form-input" id="termIp" value="192.168.1.100" placeholder="IP address">
          <input class="set-form-input" id="termPort" value="8080" placeholder="Port" style="max-width:120px;">
        </div>
        <button class="dev-test-btn" id="termTestBtn" disabled>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/></svg>
          Test Connection
        </button>
        <div class="dev-term-actions">
          <button class="dev-term-action primary" id="termAssign">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/></svg>
            Assign Existing
          </button>
          <button class="dev-term-action" id="termRegister">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Register New
          </button>
        </div>
      </div>

      <!-- Printer Configuration -->
      <button class="set-collapsible-head" data-collapse="printers">
        <span style="display:inline-flex; align-items:center; gap:9px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Printer Configuration
        </span>
        <span style="display:inline-flex; align-items:center; gap:10px; font-size:12px; color:var(--slate-500); font-weight:500;">
          0/3
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </button>
    `;
  }

  // ─── PRINT & KDS CONFIG ───
  if (pane === 'printKds') {
    if (!state.settingsSubTab) state.settingsSubTab = 'receipt';
    const tabs = [
      { id: 'receipt', label: 'Receipt Settings' },
      { id: 'order',   label: 'Order Settings' },
      { id: 'kds',     label: 'KDS & Routing' }
    ];
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Printers Kitchen</h3>
      </div>
      <div class="set-pane-tabs">
        ${tabs.map(t => `
          <button class="set-pane-tab ${state.settingsSubTab === t.id ? 'active' : ''}" data-sub-tab="${t.id}" role="tab">${escapeHtml(t.label)}</button>
        `).join('')}
      </div>
      ${state.settingsSubTab === 'receipt' ? `
        <div class="set-section-label">Copy Settings</div>
        <div class="set-card-inset">
          ${renderToggleRow('printKds.receipt.merchantCopy', 'Print Merchant Copy', 'Retains a copy for your records')}
          ${renderToggleRow('printKds.receipt.customerCopy', 'Print Customer Copy', 'Gives a copy to the guest')}
        </div>
        <div class="set-section-label">Receipt Options</div>
        <div class="set-card-inset">
          ${renderToggleRow('printKds.receipt.taxBreakdown', 'Show Tax Breakdown')}
          ${renderToggleRow('printKds.receipt.itemizedList', 'Show Itemized List')}
          ${renderToggleRow('printKds.receipt.tipOptions',   'Show Tip Options')}
        </div>
        <div class="set-section-label">Footer</div>
        <div class="set-card-inset">
          <div class="set-form-field">
            <label class="set-form-label">Footer Message</label>
            <input class="set-form-input" data-input="printKds.receipt.footer" value="${escapeHtml(SETTINGS.printKds.receipt.footer)}">
          </div>
        </div>
      ` : state.settingsSubTab === 'order' ? `
        <div class="set-section-label">Order Routing</div>
        <div class="set-card-inset">
          ${renderToggleRow('printKds.kitchen.autoFire', 'Auto-fire orders to kitchen', 'Send tickets the moment the order is placed')}
          ${renderToggleRow('printKds.kitchen.groupByStation', 'Group items by station', 'Cold items to salads, hot items to grill, etc.')}
          ${renderToggleRow('printKds.kitchen.printTimer', 'Print prep timer on tickets')}
        </div>
      ` : `
        <div class="set-section-label">KDS Display</div>
        <div class="set-card-inset">
          ${renderToggleRow('printKds.kitchen.includeModifiers', 'Include modifiers on KDS', 'Show item add-ons under each line')}
          ${renderToggleRow('printKds.kitchen.groupByStation', 'Color-code by station')}
        </div>
        <div class="set-section-label" style="margin-top:18px;">Routing</div>
        <div class="set-card-inset">
          <div class="set-form-field">
            <label class="set-form-label">Default station</label>
            <select class="set-form-input" data-input="printKds.kitchen.defaultStation">
              <option>Main Kitchen</option><option>Cold Station</option><option>Expo</option>
            </select>
          </div>
        </div>
      `}
    `;
  }

  // ─── RECEIPT TEMPLATES ───
  if (pane === 'receiptTpl') {
    const tabs = [
      { id: 'sale',    label: 'Sale Receipt' },
      { id: 'kitchen', label: 'Kitchen Ticket' },
      { id: 'nosale',  label: 'No Sale' },
      { id: 'void',    label: 'Void Order' },
      { id: 'time',    label: 'Time Sheet' }
    ];
    if (!state.settingsSubTab || !tabs.find(t => t.id === state.settingsSubTab)) state.settingsSubTab = 'sale';
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Receipt Templates</h3>
      </div>
      <div class="set-pane-tabs">
        ${tabs.map(t => `<button class="set-pane-tab ${state.settingsSubTab === t.id ? 'active' : ''}" data-sub-tab="${t.id}" role="tab">${escapeHtml(t.label)}</button>`).join('')}
      </div>
      <div class="set-receipt-split">
        <div class="set-receipt-preview">
          <div class="set-preview-head">
            <span class="set-section-label" style="margin:0;">Live Preview</span>
            <span class="set-preview-hint">Long-press to reorder</span>
          </div>
          <div class="set-receipt-paper">
            <div class="set-receipt-dotted">Logo (hidden)</div>
            <div style="font-weight:700; font-size:14px; color:var(--ink); margin:6px 0 2px;">Maple & Vine &mdash; 218 Oak Street</div>
            <div style="font-size:11px; color:var(--slate-500);">123 Main St, City, ST 12345</div>
            <div style="font-size:11px; color:var(--slate-500);">(555) 123-4567</div>
            <hr style="border:none; border-top:1px dashed var(--slate-200); margin:10px 0;">
            <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--slate-600);"><span>Order #1042</span><span>01/15/2026</span></div>
            <div style="font-size:11.5px; color:var(--slate-600);">Dine In &middot; Table 5</div>
            <div style="font-size:11.5px; color:var(--slate-600);">Server: Sarah M.</div>
            <hr style="border:none; border-top:1px dashed var(--slate-200); margin:10px 0;">
            <div class="set-receipt-line">1x Cheeseburger <span>$12.99</span></div>
            <div class="set-receipt-mod">+ Extra Cheese, No Onions</div>
            <div class="set-receipt-line">1x Caesar Salad <span>$9.50</span></div>
            <div class="set-receipt-mod">+ Grilled Chicken</div>
            <div class="set-receipt-line">2x Iced Tea <span>$5.98</span></div>
            <hr style="border:none; border-top:1px dashed var(--slate-200); margin:10px 0;">
            <div class="set-receipt-line"><span>Subtotal</span><span>$28.47</span></div>
            <div class="set-receipt-line"><span>Tax (8.25%)</span><span>$2.35</span></div>
            <div class="set-receipt-line" style="font-weight:700; font-size:14px; color:var(--ink); margin-top:6px;"><span>Total</span><span>$30.82</span></div>
            <hr style="border:none; border-top:1px dashed var(--slate-200); margin:10px 0;">
            <div class="set-receipt-line"><span>Tip:</span><span>______</span></div>
            <div class="set-receipt-line"><span>Total w/ Tip:</span><span>______</span></div>
            <hr style="border:none; border-top:1px dashed var(--slate-200); margin:10px 0;">
            <div class="set-receipt-line"><span>Paid: Card</span><span>$30.82</span></div>
            <div class="set-receipt-mod">Visa ending in 4242</div>
            <div class="set-receipt-dotted" style="margin-top:10px;">Footer (hidden)</div>
            <div class="set-receipt-dotted">Barcode / QR (hidden)</div>
          </div>
        </div>
        <div class="set-receipt-settings">
          <div class="set-preview-head">
            <span class="set-section-label" style="margin:0;">Settings</span>
            <div style="display:flex; gap:6px;">
              <button class="set-link-btn">Copy from Location</button>
              <button class="set-link-btn primary" id="setPresetsBtn"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline; vertical-align:-1px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Presets</button>
            </div>
          </div>
          <button class="set-collapsible-head" data-collapse="branding">
            <span>BRANDING</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="set-form-field" style="margin-top:8px;">
            <label class="set-form-label">HEADER TEXT</label>
            <input class="set-form-input" data-input="receiptTpl.branding.headerText" placeholder="e.g. Welcome to Our Restaurant!" value="${escapeHtml(SETTINGS.receiptTpl.branding.headerText)}">
          </div>
          <div class="set-form-field">
            <label class="set-form-label">FOOTER TEXT</label>
            <input class="set-form-input" data-input="receiptTpl.branding.footerText" placeholder="e.g. Thank you, see you again!" value="${escapeHtml(SETTINGS.receiptTpl.branding.footerText)}">
          </div>
          <button class="set-collapsible-head" data-collapse="content" style="margin-top:14px;">
            <span>CONTENT</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="set-card-inset" style="margin-top:8px;">
            ${renderToggleRow('receiptTpl.content.showModifiers', 'Show Item Modifiers', 'Print add-ons and customizations under each item')}
            ${renderToggleRow('receiptTpl.content.showTax',       'Show Tax Breakdown', 'Print tax rate and amount as a separate line')}
            ${renderToggleRow('receiptTpl.content.showTip',       'Show Tip Line', 'Add a blank tip line for card transactions')}
          </div>
          <div class="set-bottom-actions">
            <button class="set-link-btn">↗ Test Print</button>
            <button class="set-saved-pill"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;"><path d="M5 12l5 5L20 7"/></svg> Saved</button>
          </div>
        </div>
      </div>
    `;
  }

  // ─── CASH MANAGEMENT ───
  if (pane === 'cashMgmt') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Cash Management</h3>
        <p class="set-pane-desc">Configure drawers, approval rules, and reconciliation.</p>
        <button class="set-pane-refresh" aria-label="Refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/></svg></button>
      </div>
      <div class="set-section-label">Drawer Assignment</div>
      <div class="set-card-inset">
        <div style="font-size:13px; color:var(--slate-600); padding-bottom:10px;">Assign physical cash drawers to stations. Only active drawers for this location shown.</div>
        ${SETTINGS.devices.stations.map(s => `
          <div class="set-card-row">
            <div>
              <div class="set-row-label">${escapeHtml(s.name)}</div>
              <div class="set-row-sub" style="text-transform:capitalize;">${escapeHtml(s.type)} &middot; ${escapeHtml(s.code)}</div>
            </div>
            ${s.drawer ? `<span class="set-pill-brand">${escapeHtml(s.drawer)}</span>` : `<button class="set-link-btn">Assign &rarr;</button>`}
          </div>
        `).join('')}
      </div>
      <div class="set-section-label">Drawer Session</div>
      <div class="set-card-inset">
        ${renderToggleRow('cashMgmt.requireCount', 'Require open/close count', 'Cashiers must count the drawer at shift boundaries')}
        ${renderToggleRow('cashMgmt.blindCount',   'Blind count', 'Hide expected amount from cashier during counting')}
        <div class="set-form-field">
          <label class="set-form-label">Starting float ($)</label>
          <input class="set-form-input" type="number" data-input="cashMgmt.floatAmount" value="${SETTINGS.cashMgmt.floatAmount}">
        </div>
        <div class="set-form-field">
          <label class="set-form-label">Over/short alert threshold ($)</label>
          <input class="set-form-input" type="number" step="0.01" data-input="cashMgmt.overShortAlert" value="${SETTINGS.cashMgmt.overShortAlert}">
        </div>
      </div>
      <div class="set-section-label">No Sale Settings</div>
      <div class="set-card-inset">
        ${renderToggleRow('cashMgmt.noSaleRequiresApproval', 'Manager approval for No-Sale opens', 'Require a manager PIN before opening the drawer without a transaction')}
      </div>
    `;
  }

  // ─── FRAUD DETECTION ───
  if (pane === 'fraud') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Fraud Detection</h3>
        <p class="set-pane-desc">Detect and prevent refund-to-self fraud patterns. When enabled, the system tracks when the same cashier who created an order also refunds it for cash, and escalates through alert and block thresholds.</p>
      </div>
      <div class="set-card-inset">
        <div class="set-card-row" style="padding:14px 16px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span class="set-icon-circle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg></span>
            <div>
              <div class="set-row-label">Refund-to-Self Guard</div>
              <div class="set-row-sub">${SETTINGS.fraud.refundSelfGuard ? 'Enabled &mdash; tracking refund patterns' : 'Disabled &mdash; no refund velocity checks'}</div>
            </div>
          </div>
          <button class="toggle-sw ${SETTINGS.fraud.refundSelfGuard ? '' : 'off'}" data-toggle="fraud.refundSelfGuard" role="switch" aria-checked="${SETTINGS.fraud.refundSelfGuard}"></button>
        </div>
      </div>

      <div class="set-card-inset">
        <div style="font-size:14px; font-weight:600; color:var(--ink); padding:0 0 8px; display:flex; align-items:center; gap:8px;">
          <span style="color:var(--slate-500); font-size:13px;">#</span> Current Session
        </div>
        <div style="font-size:13px; color:var(--slate-500); padding-bottom:6px;">No flagged refund events on this device.</div>
      </div>

      <div class="set-info-card">
        <div style="font-size:13.5px; font-weight:600; color:var(--brand-600); margin-bottom:8px;">How it works</div>
        <div style="font-size:13px; color:var(--slate-700); line-height:1.7;">When a cashier refunds a cash order they created:</div>
        <ul style="font-size:13px; color:var(--slate-700); line-height:1.7; padding-left:20px; list-style:disc; margin-top:4px;">
          <li>After ${SETTINGS.fraud.pinAfter} refunds: a warning toast and notification are shown</li>
          <li>After ${SETTINGS.fraud.lockAfter} refunds: the refund is blocked until a manager enters their PIN</li>
          <li>All flagged refunds are logged to the audit trail for nightly review</li>
          <li>The counter resets after ${SETTINGS.fraud.resetMinutes} minutes of no activity</li>
        </ul>
      </div>
    `;
  }

  // ─── DINING ROOM ───
  if (pane === 'diningRoom') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Dining Room</h3>
        <p class="set-pane-desc">Manage floor plans and table configurations.</p>
      </div>
      <div class="set-card-inset">
        <div style="font-size:14px; font-weight:600; color:var(--ink); margin-bottom:14px; display:flex; align-items:center; gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          Floor Plans
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          ${SETTINGS.diningRoom.floorPlans.map(fp => `
            <div class="set-floor-card">
              <div style="display:flex; align-items:center; gap:9px; margin-bottom:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                <span style="font-size:13.5px; font-weight:600; color:var(--ink);">${escapeHtml(fp.name)}</span>
              </div>
              <div style="font-size:12px; color:var(--slate-500); margin-bottom:12px;">${fp.tables} Tables configured</div>
              <button class="set-floor-edit">Edit Layout &rarr;</button>
            </div>
          `).join('')}
          <button class="set-floor-add">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            <span>Create New</span>
          </button>
        </div>
      </div>

      <div class="set-card-inset">
        <div style="font-size:14px; font-weight:600; color:var(--ink); margin-bottom:14px; display:flex; align-items:center; gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 15l-3-3 3-3M18 9l3 3-3 3"/></svg>
          Table Configuration
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="set-form-field" style="margin-bottom:0;">
            <label class="set-form-label">Default Party</label>
            <input class="set-form-input" type="number" min="1" max="20" data-input="diningRoom.defaultParty" value="${SETTINGS.diningRoom.defaultParty}">
          </div>
          <div class="set-form-field" style="margin-bottom:0;">
            <label class="set-form-label">Sitting Time (min)</label>
            <input class="set-form-input" type="number" min="15" max="240" data-input="diningRoom.sittingMinutes" value="${SETTINGS.diningRoom.sittingMinutes}">
          </div>
        </div>
        <div style="margin-top:14px;">
          ${renderToggleRow('diningRoom.allowMerging', 'Allow Table Merging', 'Enables combining tables for large parties')}
        </div>
      </div>

      <div class="set-card-inset">
        <div style="font-size:14px; font-weight:600; color:var(--ink); padding:0 0 10px; display:flex; align-items:center; gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>
          Order Management
        </div>
        ${renderToggleRow('diningRoom.autoAssignServer', 'Auto-assign server', 'Assign tables to the next available server')}
        ${renderToggleRow('diningRoom.showCovers',       'Show covers on floor plan', 'Display guest count on each occupied table')}
      </div>
    `;
  }

  // ─── CUSTOMER DISPLAY ───
  if (pane === 'customerDisplay') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Stations &amp; Devices</h3>
        <p class="set-pane-desc">View stations, capabilities, and linked payment terminals.</p>
        <button class="set-pane-refresh" aria-label="Refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/></svg></button>
      </div>
      <div class="set-card-inset">
        <div class="set-card-row" style="padding:14px 0 18px; border-bottom:1px solid var(--slate-100);">
          <div style="display:flex; align-items:center; gap:14px;">
            <span class="set-icon-circle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg></span>
            <div>
              <div class="set-row-label">Customer Display</div>
              <div class="set-row-sub">Show order details to customers</div>
            </div>
          </div>
          <span style="font-size:11px; font-weight:600; color:var(--slate-500); display:inline-flex; align-items:center; gap:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18 18H2V8.5"/><path d="M22 16V8.5L16 4.5"/></svg> CFD</span>
        </div>
        <button class="set-connect-btn" id="setConnectBtn">Connect Display</button>
      </div>
      <div class="set-card-row" style="padding:14px 0;">
        <div>
          <div class="set-row-label">Show right side panel</div>
          <div class="set-row-sub">Controls the optional right panel on the ordering customer display</div>
        </div>
        <button class="toggle-sw ${SETTINGS.customerDisplay.showRightPanel ? '' : 'off'}" data-toggle="customerDisplay.showRightPanel" role="switch" aria-checked="${SETTINGS.customerDisplay.showRightPanel}"></button>
      </div>
      <div class="set-section-label">Right Panel Layout</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        ${renderRadioRow('customerDisplay.rightPanelLayout', 'single',  'Single Image', '')}
        ${renderRadioRow('customerDisplay.rightPanelLayout', 'stacked', 'Stacked Images', '')}
      </div>

      <div class="set-card-inset">
        <div class="set-card-row" style="border:none; padding:0 0 10px;">
          <div>
            <div class="set-row-label">Idle Carousel Images</div>
            <div class="set-row-sub">Shown while the customer display is idle</div>
          </div>
          <button class="set-link-btn"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;"><path d="M12 5v14M5 12h14"/></svg> Add Image</button>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <div class="set-image-tile">
            <div class="set-image-mock" style="background:linear-gradient(135deg,#0F1424 0%,#1E2536 100%);"><span style="color:#FEBC2E; font-family:cursive; font-size:24px; font-weight:700; transform:rotate(-3deg); display:inline-block;">Maple & Vine</span></div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px;">
              <span class="mm-badge active" style="background:var(--brand-50); color:var(--brand-500); font-size:9.5px;">On</span>
              <button class="set-tile-del" aria-label="Delete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
            </div>
          </div>
        </div>
      </div>

      <div class="set-card-inset">
        <div style="font-size:14px; font-weight:600; color:var(--ink); margin-bottom:4px;">Ordering Right Panel Images</div>
        <div style="font-size:12.5px; color:var(--slate-500); margin-bottom:14px;">Shown on the ordering screen when the right panel is enabled</div>
        <div style="font-size:13px; font-weight:600; color:var(--ink); margin-bottom:2px;">Primary Slot</div>
        <div style="font-size:12px; color:var(--slate-500); margin-bottom:6px;">Used for single-image layout</div>
        <div style="font-size:12px; color:var(--brand-500); font-weight:600; margin-bottom:12px;">Crop: Vertical 9:16</div>
        <button class="set-vertical-add">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          <span>Add Vertical</span>
        </button>
      </div>
    `;
  }

  // ─── ORDER LINE ───
  if (pane === 'orderLine') {
    const opts = [
      { value: 'today', label: 'Today Only',  sub: 'Only show orders from today' },
      { value: '2d',    label: 'Last 2 Days', sub: 'Today and yesterday' },
      { value: '3d',    label: 'Last 3 Days', sub: 'Today and 2 previous days' },
      { value: '7d',    label: 'Last 7 Days', sub: 'Orders from the past week' },
      { value: '14d',   label: 'Last 14 Days',sub: 'Orders from the past 2 weeks' },
      { value: '30d',   label: 'Last 30 Days',sub: 'Orders from the past month' },
    ];
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Order Line Settings</h3>
        <p class="set-pane-desc">Configure how orders appear in the order line.</p>
      </div>
      <button class="set-collapsible-head" data-collapse="order-vis">
        <span style="display:inline-flex; align-items:center; gap:9px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Order Visibility
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15l6-6 6 6"/></svg>
      </button>
      <div style="font-size:13px; color:var(--slate-600); margin-bottom:10px; padding:0 4px;">
        Choose how many days of orders to display in the order line. Older orders will be hidden from the order line but can still be found in order history.
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${opts.map(o => renderRadioRow('orderLine.visibility', o.value, o.label, o.sub)).join('')}
      </div>
      <button class="set-collapsible-head" data-collapse="order-view" style="margin-top:18px;">
        <span style="display:inline-flex; align-items:center; gap:9px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Order Line View
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    `;
  }

  // ─── NOTIFICATIONS ───
  if (pane === 'notifications') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title" style="display:inline-flex; align-items:center; gap:10px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Notifications
        </h3>
        <p class="set-pane-desc">Configure sound alerts when external orders arrive at this station.</p>
      </div>

      <div class="set-card-inset">
        <div style="font-size:17px; font-weight:700; color:var(--ink); margin-bottom:14px;">Sound Alerts</div>
        <div class="set-card-row" style="border-top:1px solid var(--slate-100); padding:16px 0 0;">
          <div>
            <div class="set-row-label">Enable Sound Alerts</div>
            <div class="set-row-sub">Play a sound when orders arrive from external sources (online, kiosk, third-party)</div>
          </div>
          <button class="toggle-sw ${SETTINGS.notif.soundEnabled ? '' : 'off'}" data-toggle="notif.soundEnabled" role="switch" aria-checked="${SETTINGS.notif.soundEnabled}"></button>
        </div>
      </div>

      <div class="set-card-inset">
        <div style="font-size:17px; font-weight:700; color:var(--ink); margin-bottom:14px;">Order Source Sounds</div>
        ${renderSoundRow('online',     'Online Orders',      'Plays when a new order arrives from this source', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>')}
        ${renderSoundRow('kiosk',      'Kiosk Orders',       'Plays when a new order arrives from this source', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>')}
        ${renderSoundRow('thirdParty', 'Third-Party Orders', 'Plays when a new order arrives from this source', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>')}
      </div>

      <div class="set-section-label">Other Channels</div>
      <div class="set-card-inset">
        ${renderToggleRow('notif.vibration',    'Vibration', 'Vibrate the tablet on alerts (mobile only)')}
      </div>
      <div class="set-section-label">Events</div>
      <div class="set-card-inset">
        ${renderToggleRow('notif.newOrder',   'New order received', 'Show a toast and ping when a new order arrives')}
        ${renderToggleRow('notif.orderReady', 'Order ready for pickup')}
        ${renderToggleRow('notif.lowStock',   'Low-stock alerts')}
        ${renderToggleRow('notif.suspicious', 'Suspicious-pattern alerts')}
        ${renderToggleRow('notif.dailyEmail', 'Daily closeout email')}
      </div>
    `;
  }

  // ─── BUSINESS PROFILE ───
  if (pane === 'business') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Business Profile</h3>
        <p class="set-pane-desc">How DEXA identifies your restaurant on receipts and reports.</p>
      </div>
      <div class="set-card-inset">
        <div class="set-form-field">
          <label class="set-form-label">Business name</label>
          <input class="set-form-input" data-input="business.name" value="${escapeHtml(SETTINGS.business.name)}">
        </div>
        <div class="set-form-field">
          <label class="set-form-label">Default location</label>
          <input class="set-form-input" data-input="business.location" value="${escapeHtml(SETTINGS.business.location)}">
        </div>
        <div class="set-card-row" style="padding:14px 0; border-bottom:1px solid var(--slate-100);">
          <span class="set-row-label">Time zone</span>
          <span class="set-row-value">${escapeHtml(SETTINGS.business.tz)}</span>
        </div>
        <div class="set-card-row" style="padding:14px 0;">
          <span class="set-row-label">Currency</span>
          <span class="set-row-value">${escapeHtml(SETTINGS.business.currency)}</span>
        </div>
      </div>
    `;
  }

  // ─── PAYMENTS ───
  if (pane === 'payments') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Payments</h3>
        <p class="set-pane-desc">Choose which payment methods appear on the pay screen.</p>
      </div>
      <div class="set-section-label">Accepted Methods</div>
      <div class="set-card-inset">
        ${renderToggleRow('payments.card',   'Credit & debit cards')}
        ${renderToggleRow('payments.cash',   'Cash')}
        ${renderToggleRow('payments.mobile', 'Apple Pay / Google Pay')}
        ${renderToggleRow('payments.gift',   'Gift cards')}
      </div>
      <div class="set-section-label">Processor</div>
      <div class="set-card-inset">
        <div class="set-card-row" style="padding:14px 0; border-bottom:1px solid var(--slate-100);"><span class="set-row-label">Processor</span><span class="set-row-value">DEXA Pay (Stripe)</span></div>
        <div class="set-card-row" style="padding:14px 0; border-bottom:1px solid var(--slate-100);"><span class="set-row-label">Card rate</span><span class="set-row-value">2.6% + $0.10</span></div>
        <div class="set-card-row" style="padding:14px 0;"><span class="set-row-label">Next deposit</span><span class="set-row-value">Tomorrow, 9:00 AM</span></div>
      </div>
    `;
  }

  // ─── TAX ───
  if (pane === 'tax') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Tax & Service</h3>
        <p class="set-pane-desc">Applied to all taxable items at checkout.</p>
      </div>
      <div class="set-card-inset">
        <div class="set-form-field">
          <label class="set-form-label">Sales tax rate (%)</label>
          <input class="set-form-input" type="number" step="0.01" min="0" max="20" data-input="tax.rate" value="${SETTINGS.tax.rate}">
        </div>
      </div>
      <div class="set-section-label">Service Charge</div>
      <div class="set-card-inset">
        <div class="set-card-row" style="padding:14px 0;"><span class="set-row-label">Auto-grat for parties of 6+</span><span class="set-row-value">18%</span></div>
      </div>
    `;
  }

  // ─── STAFF & ROLES ───
  if (pane === 'staff') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Staff & Roles</h3>
        <p class="set-pane-desc">${STAFF.length} active employees &middot; See full list in Scheduling.</p>
      </div>
      <div class="set-card-inset">
        ${STAFF.map(s => `
          <div class="set-card-row" style="padding:14px 0; border-bottom:1px solid var(--slate-100);">
            <div style="display:flex; align-items:center; gap:12px;">
              <span class="user-avatar" style="background:${s.color}; width:32px; height:32px; font-size:11px;">${s.initials}</span>
              <div>
                <div class="set-row-label">${escapeHtml(s.name)}</div>
                <div class="set-row-sub">${escapeHtml(s.role)}</div>
              </div>
            </div>
            <button class="set-link-btn">Edit &rarr;</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── INTEGRATIONS ───
  if (pane === 'integrations') {
    const integrations = [
      { name: 'QuickBooks',  status: 'connected' },
      { name: 'Mailchimp',   status: 'connected' },
      { name: 'DoorDash',    status: 'connected' },
      { name: 'Uber Eats',   status: 'available' },
      { name: 'Resy',        status: 'available' },
      { name: '7shifts',     status: 'connected' }
    ];
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Integrations</h3>
        <p class="set-pane-desc">Third-party apps integrated with DEXA.</p>
      </div>
      <div class="set-card-inset">
        ${integrations.map(i => `
          <div class="set-card-row" style="padding:14px 0; border-bottom:1px solid var(--slate-100);">
            <span class="set-row-label">${escapeHtml(i.name)}</span>
            <span class="set-row-value" style="color:${i.status === 'connected' ? 'var(--success)' : 'var(--slate-400)'};">${i.status === 'connected' ? '● Connected' : '○ Available'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── AUDIT LOG ───
  if (pane === 'audit') {
    const events = [
      { time: '5:42 PM', event: 'Payment processed', detail: 'Order #S1-0007 · $42.30 · Card', user: 'Samir K' },
      { time: '5:31 PM', event: 'Discount applied', detail: '10% off · Order #S1-0006', user: 'Samir K' },
      { time: '5:14 PM', event: 'Order voided', detail: 'Order #S1-0005 · Manager PIN required', user: 'Jordan P' },
      { time: '4:48 PM', event: 'Inventory updated', detail: 'Whole Milk · 12 gal received', user: 'Samir K' },
      { time: '3:33 PM', event: 'Refund issued', detail: 'Order #Y1-0039 · $14.50', user: 'Samir K' },
      { time: '2:15 PM', event: 'Settings changed', detail: 'Tax rate updated to 8.88%', user: 'Samir K' },
      { time: '1:11 PM', event: 'Staff clocked in', detail: 'Casey Walker · Server', user: 'System' }
    ];
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Audit Log</h3>
        <p class="set-pane-desc">Last 7 events. Full log retained for 90 days.</p>
      </div>
      <div class="set-card-inset">
        ${events.map(e => `
          <div class="set-card-row" style="padding:14px 0; border-bottom:1px solid var(--slate-100); align-items:flex-start;">
            <div style="flex:1; min-width:0;">
              <div class="set-row-label">${escapeHtml(e.event)}</div>
              <div class="set-row-sub" style="margin-top:2px;">${escapeHtml(e.detail)}</div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
              <div style="font-size:12px; color:var(--ink); font-weight:600;">${escapeHtml(e.time)}</div>
              <div style="font-size:11px; color:var(--slate-500);">${escapeHtml(e.user)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── CX PANES (Loyalty, Messaging, Feedback) ───
  if (pane === 'cxLoyalty') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Loyalty Program</h3>
        <p class="set-pane-desc">Configure how rewards work for your regulars.</p>
      </div>
      <div class="set-card-inset" style="text-align:center; padding:40px 20px;">
        <div style="font-size:14px; color:var(--slate-600); margin-bottom:6px;">Manage detailed loyalty rules from the Loyalty screen.</div>
        <button class="set-link-btn primary" onclick="showScreen('loyalty')">Open Loyalty &rarr;</button>
      </div>
    `;
  }
  if (pane === 'cxMessaging') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Messaging</h3>
        <p class="set-pane-desc">Order-status texts, reservation confirmations, and marketing campaigns.</p>
      </div>
      <div class="set-card-inset"><div style="font-size:13px; color:var(--slate-500); padding:30px; text-align:center;">Messaging configuration coming soon.</div></div>
    `;
  }
  if (pane === 'cxFeedback') {
    return `
      <div class="set-pane-head">
        <h3 class="set-pane-title">Reviews & Feedback</h3>
        <p class="set-pane-desc">Collect guest reviews after their visit.</p>
      </div>
      <div class="set-card-inset"><div style="font-size:13px; color:var(--slate-500); padding:30px; text-align:center;">Review collection coming soon.</div></div>
    `;
  }

  return '';
}

/* ─── GLOBAL EVENT WIRING ────────────────────────────────────────── */

document.addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) { e.preventDefault(); showScreen(goto.dataset.goto); return; }
});

// Sales — menu cards (delegate on stable parent so listener survives DOM rebuilds)
$('#menuGridContainer').addEventListener('click', (e) => {
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

// New sales layout buttons
const selectTableBtn = $('#selectTableBtn');
if (selectTableBtn) selectTableBtn.addEventListener('click', () => {
  showScreen('tables');
});
const customItemBtn = $('#customItemBtn');
if (customItemBtn) customItemBtn.addEventListener('click', () => {
  openModal(`
    <div class="modal-head">
      <div><h2 class="modal-title" id="modalTitle">Custom Item</h2><p class="modal-sub">Add a one-off line item to this order.</p></div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label" for="customItemName">Name</label><input class="form-input" id="customItemName" placeholder="e.g. Custom Item"></div>
      <div class="form-group"><label class="form-label" for="customItemPrice">Price</label><input class="form-input" id="customItemPrice" type="number" step="0.01" placeholder="0.00"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="addCustomItem()">Add to Order</button>
    </div>
  `);
});
window.addCustomItem = function() {
  const name = $('#customItemName').value.trim();
  const price = parseFloat($('#customItemPrice').value);
  if (!name || isNaN(price) || price <= 0) { toast('Enter a name and price', true); return; }
  state.currentOrder.push({ id: 'custom-'+Date.now(), name, price, cashPrice: price*0.96, qty: 1, mods: [] });
  recalcOrder(); closeModal();
  toast(name + ' added');
};

const dineInToggleBtn = $('#dineInToggle');
if (dineInToggleBtn) dineInToggleBtn.addEventListener('click', () => {
  toast('Service preview toggled');
});
const otherOrderToggleBtn = $('#otherOrderToggle');
if (otherOrderToggleBtn) otherOrderToggleBtn.addEventListener('click', () => {
  toast('Switching to other open order…');
});
const listViewToggleBtn = $('#listViewToggle');
if (listViewToggleBtn) listViewToggleBtn.addEventListener('click', () => {
  toast('List view toggled');
});
const standardMenuBtn = $('#standardMenuBtn');
if (standardMenuBtn) standardMenuBtn.addEventListener('click', () => {
  toast('Standard Menu selected');
});
const orderlinePill = $('#orderlinePill');
if (orderlinePill) orderlinePill.addEventListener('click', () => {
  toast('Order options menu');
});
const completeAllBtn = $('#completeAllBtn');
if (completeAllBtn) completeAllBtn.addEventListener('click', () => toast('All preparing orders marked complete'));

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

  const locSwitch = $('#locSwitcher');
  if (locSwitch) {
    locSwitch.addEventListener('click', () => {
      openModal(`
        <div class="modal-head">
          <div><h2 class="modal-title" id="modalTitle">Switch Location</h2><p class="modal-sub">Choose which Maple & Vine location this station belongs to.</p></div>
          <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <button class="loc-option active" data-loc="hylan">
            <div class="loc-option-main">
              <div class="loc-option-name">Maple & Vine <span class="loc-option-badge">Current</span></div>
              <div class="loc-option-addr">218 Oak Street · Riverview, OR</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
          </button>
          <button class="loc-option" data-loc="bay">
            <div class="loc-option-main">
              <div class="loc-option-name">Maple & Vine — Midtown</div>
              <div class="loc-option-addr">7811 5th Ave · Brooklyn, NY</div>
            </div>
          </button>
          <button class="loc-option" data-loc="forest">
            <div class="loc-option-main">
              <div class="loc-option-name">Maple & Vine — Westside</div>
              <div class="loc-option-addr">71-24 Austin St · Queens, NY</div>
            </div>
          </button>
        </div>
      `);
      $$('.loc-option').forEach(b => b.addEventListener('click', () => {
        const name = b.querySelector('.loc-option-name').firstChild.textContent.trim();
        toast(`Switched to ${name}`);
        closeModal();
      }));
    });
  }
})();

/* ─── INIT ───────────────────────────────────────────────────────── */

renderHome();
renderMenuTabs();
renderMenuGrid();
recalcOrder();
$('#orderNum').textContent = 'Order #' + formatOrderNum();
