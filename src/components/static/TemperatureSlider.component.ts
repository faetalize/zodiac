const temperatureLabel = document.querySelector<HTMLLabelElement>("#label-temperature");
const temperatureInput = document.querySelector<HTMLInputElement>("#temperature");
if (!temperatureLabel || !temperatureInput) {
    console.error("Temperature slider elements not found");
    throw new Error("Temperature slider component is not properly initialized.");
}

temperatureLabel.textContent = (parseInt(temperatureInput.value) / 100).toFixed(2) + "";
temperatureInput.addEventListener("input", () => {
    temperatureLabel.textContent = (parseInt(temperatureInput.value) / 100).toFixed(2) + "";
});