# Third-Party Notices

## BWB03/inventory-dashboard

The Inventory & Restock module includes adaptations inspired by
[BWB03/inventory-dashboard](https://github.com/BWB03/inventory-dashboard),
which is distributed under the MIT License.

Copyright (c) 2026 Brett Bohannon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The adapted module retains the client-side CSV import, combined AWD/FBA
inventory summary, chart lifecycle, and reset-flow concepts. Its field-mapping
layer, Map-based merge engine, data-quality reporting, risk thresholds,
filtering, pagination, XSS-safe rendering, and Seller Workbench visual design
are new implementations for this project.

## sellerviewAI/amazon-profit-calculator

The Advertising & Profitability module is an independent implementation
inspired by the publicly documented product concepts in the README of
`sellerviewAI/amazon-profit-calculator`, including SKU-level P&L, ACoS,
TACoS, break-even ACoS, and profit-leak visibility.

At the time of review, the referenced repository provided README and license
guidance rather than calculator source code suitable for reuse. No source code
was copied from that repository. This Workbench module uses its own data model,
Chinese operating workflow, UI, CSV mapping layer, and calculation engine.
