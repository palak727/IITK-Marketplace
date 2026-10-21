export const addItemToCart = (cartItems, itemId) => {
  if (cartItems[itemId]) return { cartItems, added: false };
  return { cartItems: { ...cartItems, [itemId]: 1 }, added: true };
};
