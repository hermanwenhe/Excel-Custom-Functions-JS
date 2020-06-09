import * as functionsJsonData from './test-data.json';
import { sleep, closeWorkbook} from "./test-helpers";
import { pingTestServer, sendTestResults } from "office-addin-test-helpers"; 
import { run } from "../../src/taskpane/taskpane"  
const customFunctionsData = (<any>functionsJsonData).functions; 
const port: number = 4201;
let testValues = [];

Office.initialize = async () => {
    document.getElementById('sideload-msg').style.display = 'none';
    document.getElementById('app-body').style.display = 'flex';
    document.getElementById('run').onclick = run;

    const testServerResponse: object = await pingTestServer(port);
    if (testServerResponse["status"] === 200) {
        await runCfTests(testServerResponse["platform"]);
        await runTaskpaneTest();
        await sendTestResults(testValues, port);
        await closeWorkbook();
    }
};

async function runCfTests(platform: string): Promise<void> {
    // Exercise custom functions
    await Excel.run(async context => {
        for (let key in customFunctionsData) {
            const formula: string = customFunctionsData[key].formula;
            const range = context.workbook.getSelectedRange();
            range.formulas = [[formula]];
            await context.sync();

            // Mac is slower so we need to wait longer for the function to return a value
            await sleep(platform === "Windows" ? 2000 : 8000);

            // Check to if this is a streaming function
            await readCFData(key, customFunctionsData[key].streaming != undefined ? 2 : 1, platform)
        }
    });
}

async function runTaskpaneTest(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        try {
            // Execute taskpane code
            await run();
            await sleep(2000);

            // Get output of executed taskpane code
            await Excel.run(async context => {
                const range = context.workbook.getSelectedRange();
                const cellFill = range.format.fill;
                cellFill.load('color');
                await context.sync();

                addTestResult("fill-color", cellFill.color);
                resolve();
            });
        } catch {
            reject();
        }
    });
}

export async function readCFData(cfName: string, readCount: number, platform: string): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
        await Excel.run(async context => {
            // if this is a streaming function, we want to capture two values so we can
            // validate the function is indeed streaming
            for (let i = 0; i < readCount; i++) {
                try {
                    const range = context.workbook.getSelectedRange();
                    range.load("values");
                    await context.sync();

                    // Mac is slower so we need to wait longer for the function to return a value
                    await sleep(platform === "Windows" ? 2000 : 8000);

                    addTestResult(cfName, range.values[0][0]);
                    resolve(true);

                } catch {
                    reject(false)
                }
            }
        });
    });
}

function addTestResult(resultName: string, resultValue: any) {
    var data = {};
    var nameKey = "Name";
    var valueKey = "Value";
    data[nameKey] = resultName;
    data[valueKey] = resultValue;
    testValues.push(data);
}

