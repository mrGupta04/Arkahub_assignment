# EnergyGrid Data Aggregator

## Prerequisites

- Node.js (v14 or higher)
- npm

## Install

```bash
npm install
```

## Run

1. **Start the mock server (Terminal 1):**
    ```bash
    npm start
    ```
    You should see:
    ```
    ⚡ EnergyGrid Mock API running on port 3000
       Constraints: 1 req/sec, Max 10 items/batch
    ```

2. **Run the client (Terminal 2):**
    ```bash
    npm run client
    ```

## Output

The aggregated report is written to `report.json` in the project root.

## Notes

- The client batches 500 serial numbers (SN-000 to SN-499) into groups of 10.
- It enforces a 1s delay between requests, signs each request, and retries on 429/network errors.
