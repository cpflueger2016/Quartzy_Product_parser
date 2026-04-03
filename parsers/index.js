(function () {
  function detectVendor() {
    const host = location.hostname.toLowerCase();

    if (host.includes("thermofisher")) return "thermo";
    if (host.includes("neb.com")) return "neb";
    if (host.includes("sigmaaldrich") || host.includes("milliporesigma")) return "sigma";
    if (host.includes("activemotif")) return "activemotif";
    if (host.includes("abcam")) return "abcam";

    return "generic";
  }

  function parseCurrentPage() {
    const vendor = detectVendor();

    if (vendor === "thermo") return window.ThermoParser.parseThermo();
    if (vendor === "neb") return window.NebParser.parseNeb();
    if (vendor === "sigma") return window.SigmaParser.parseSigma();
    if (vendor === "activemotif") return window.ActiveMotifParser.parseActiveMotif();
    if (vendor === "abcam") return window.AbcamParser.parseAbcam();
    if (vendor === "generic") return window.GenericParser.parseGeneric();

    return {
      vendor: "",
      itemName: "",
      catalogNumber: "",
      packSize: "",
      unitPrice: "",
      currency: "",
      sourceUrl: location.href,
      parserUsed: "generic",
      confidence: 0.1
    };
  }

  window.PageParsers = {
    detectVendor,
    parseCurrentPage
  };
})();
