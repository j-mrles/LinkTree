    document.addEventListener("DOMContentLoaded", function () {
        const serviceItems = document.querySelectorAll(".service-item");

        serviceItems.forEach(item => {
            item.addEventListener("mouseenter", function () {
                this.classList.add("hovered");
            });

            item.addEventListener("mouseleave", function () {
                this.classList.remove("hovered");
            });
        });

        const estimateButton = document.querySelector('button');

        estimateButton.addEventListener('click', function () {
            calculateLandscapingEstimate();

            playMoneySound();
        });
    });

    function calculateLandscapingEstimate() {
        const area = parseFloat(document.getElementById('area').value);
        const plants = parseInt(document.getElementById('plants').value);
        const services = document.getElementById('services').selectedOptions;

        const baseCost = 50;
        const areaCost = area * 0.1;
        const plantsCost = plants * 5;

        let servicesCost = 0;

        for (const service of services) {
            servicesCost += 20;
        }

        const totalCost = baseCost + areaCost + plantsCost + servicesCost;

        document.getElementById('landscaping-estimate-result').innerHTML = `Estimated Cost: $${totalCost.toFixed(2)}`;
    }

    function playMoneySound() {
        const moneySound = new Audio('../estimate/money.mp3');

        moneySound.play();
    }

    function printPage() {
        window.print();
    }