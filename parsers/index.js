(function () {
  function detectVendor() {
    const host = location.hostname.toLowerCase();

    if (host.includes("thermofisher")) return "thermo";
    if (host.includes("neb.com")) return "neb";
    if (host.includes("sigmaaldrich") || host.includes("milliporesigma")) return "sigma";

    return "unknown";
  }

  function parseCurrentPage() {
    const vendor = detectVendor();

    if (vendor === "thermo") return window.ThermoParser.parseThermo();
    if (vendor === "neb") return window.NebParser.parseNeb();
    if (vendor === "sigma") return window.SigmaParser.parseSigma();

    return {
      vendor: "",
      itemName: "",
      catalogNumber: "",
      packSize: "",
      unitPrice: "",
      currency: "",
      sourceUrl: location.href,
      parserUsed: "none",
      confidence: 0
    };
  }

  window.PageParsers = {
    detectVendor,
    parseCurrentPage
  };
})();