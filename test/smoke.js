const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.createContext(ctx);
['data.js', 'generator.js', 'naming.js', 'formula.js', 'svg-render.js'].forEach(f => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
});

const settings = {
  chainMin: 1, chainMax: 8,
  features: { branching: true, combinedGroups: true, rings: true, positionIsomerism: true, multiGroups: true, geometricIsomerism: true }
};

const families = ['alkane', 'alkene', 'alkyne', 'haloalkane', 'alcohol', 'aldehyde', 'ketone', 'carboxylicAcid', 'ester', 'amine', 'amide', 'ether', 'aromatic', 'nitrile', 'thiol'];

let errors = 0;
families.forEach(family => {
  console.log(`\n=== ${family} ===`);
  for (let i = 0; i < 12; i++) {
    try {
      const mol = ctx.generateMolecule(family, settings, true);
      const name = ctx.nameMolecule(mol);
      const molFormula = ctx.molecularFormulaText(mol);
      const condensed = ctx.condensedStructuralFormula(mol);
      const svg = ctx.renderMolecule(mol);
      console.log(`${name}  |  ${molFormula}  |  ${condensed}  |  ring=${mol.ring} n=${mol.chainLength}  |  svgLen=${svg.length}`);
    } catch (e) {
      errors++;
      console.log('ERROR:', e.message);
    }
  }
});

console.log(`\n${errors} errors out of ${families.length * 12} generations`);
