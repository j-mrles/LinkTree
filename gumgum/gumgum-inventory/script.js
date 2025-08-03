// Dummy data (replace later with web-scraped)
const cards = [
    { name: "Umbreon VMAX - Moonbreon (Evolving Skies)", type: "Dark", rarity: "Alternate Art Secret Rare", price: "$580", stock: 1 },
    { name: "Pikachu VMAX - Prismatic (Celebrations)", type: "Electric", rarity: "Ultra Rare", price: "$130", stock: 3 },
    { name: "Charizard - Shining Fates", type: "Fire", rarity: "Shiny VMAX", price: "$90", stock: 5 },
    { name: "Lugia V - Silver Tempest", type: "Psychic", rarity: "Alternate Art", price: "$150", stock: 2 },
    { name: "Mewtwo VSTAR - Pokémon GO", type: "Psychic", rarity: "Gold Secret Rare", price: "$45", stock: 4 }
  ];
  
  function renderTable(data) {
    const tableBody = document.getElementById('cardTableBody');
    tableBody.innerHTML = '';
    data.forEach(card => {
      const row = `<tr>
        <td>${card.name}</td>
        <td>${card.type}</td>
        <td>${card.rarity}</td>
        <td>${card.price}</td>
        <td>${card.stock}</td>
      </tr>`;
      tableBody.innerHTML += row;
    });
  }
  
  document.getElementById('searchBar').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = cards.filter(card => card.name.toLowerCase().includes(query));
    renderTable(filtered);
  });
  
  window.onload = () => renderTable(cards);
  