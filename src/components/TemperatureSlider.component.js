const temperatureLabel = document.querySelector("#label-temperature");
const temperatureInput = document.querySelector("#temperature");

temperatureLabel.textContent = temperatureInput.value / 100;
temperatureInput.addEventListener("input", () => {
    temperatureLabel.textContent = temperatureInput.value / 100;
});