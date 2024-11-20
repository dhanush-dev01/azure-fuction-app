const { DefaultAzureCredential } = require("@azure/identity");
const { ResourceManagementClient } = require("@azure/arm-resources");
const { ComputeManagementClient } = require("@azure/arm-compute");

module.exports = async function (context, req) {
    try {
        // Extract resource group name and VM name from the query or body
        const resourceGroupName = req.query.resourceGroupName || (req.body && req.body.resourceGroupName);
        const vmName = req.query.vmName || (req.body && req.body.vmName);

        if (!resourceGroupName) {
            context.res = {
                status: 400,
                body: "Please provide a 'resourceGroupName' in the query string or request body."
            };
            return;
        }

        // Azure Credentials
        const credential = new DefaultAzureCredential();

        // Subscription ID
        const subscriptionId = "18734c3c-d5db-4b72-a753-b4a43b144e93";

        // Initialize total points
        let totalPoints = 0;
        const maxPointsPerCheck = 10; // Maximum points for each validation (resource group, VM, osType, vmSize)

        // Resource Management Client
        const resourceClient = new ResourceManagementClient(credential, subscriptionId);

        // Check if the resource group exists
        let resourceGroupDetails;
        try {
            resourceGroupDetails = await resourceClient.resourceGroups.get(resourceGroupName);
            totalPoints += maxPointsPerCheck; // Add points if resource group is valid
            context.log(`Resource group '${resourceGroupName}' validated. Points added: ${maxPointsPerCheck}`);
        } catch (error) {
            if (error.statusCode === 404) {
                context.log(`Resource group '${resourceGroupName}' not found. Deducting ${maxPointsPerCheck} points.`);
                totalPoints -= maxPointsPerCheck; // Deduct points if resource group is not found
            } else {
                throw error;
            }
        }

        // If VM name is provided, validate the VM
        let vmDetails;
        if (vmName) {
            const computeClient = new ComputeManagementClient(credential, subscriptionId);
            try {
                vmDetails = await computeClient.virtualMachines.get(resourceGroupName, vmName, { expand: 'instanceView' });
                const osType = vmDetails.storageProfile.osDisk.osType;
                const vmSize = vmDetails.hardwareProfile.vmSize;

                // Validate osType
                if (osType === "Linux" || osType === "Windows") {
                    totalPoints += maxPointsPerCheck; // Add points if osType is valid
                    context.log(`VM '${vmName}' OS validated: ${osType}. Points added: ${maxPointsPerCheck}`);
                } else {
                    totalPoints -= maxPointsPerCheck; // Deduct points if osType is invalid
                    context.log(`VM '${vmName}' OS type invalid. Deducting ${maxPointsPerCheck} points.`);
                }

                // Validate vmSize
                const validVmSizes = ["Standard_DC2ds_v3", "Standard_B2s", "Standard_D2s_v3"]; // Add your valid VM sizes here
                if (validVmSizes.includes(vmSize)) {
                    totalPoints += maxPointsPerCheck; // Add points if vmSize is valid
                    context.log(`VM '${vmName}' size validated: ${vmSize}. Points added: ${maxPointsPerCheck}`);
                } else {
                    totalPoints -= maxPointsPerCheck; // Deduct points if vmSize is invalid
                    context.log(`VM '${vmName}' size invalid. Deducting ${maxPointsPerCheck} points.`);
                }

            } catch (error) {
                if (error.statusCode === 404) {
                    context.log(`VM '${vmName}' not found in resource group '${resourceGroupName}'. Deducting ${maxPointsPerCheck} points.`);
                    totalPoints -= maxPointsPerCheck; // Deduct points if VM is not found
                } else {
                    throw error;
                }
            }
        }

        // Construct the response object
        const response = {
            message: "Validation results",
            resourceGroupStatus: resourceGroupDetails ? "Validated" : "Not Found",
            vmStatus: vmDetails ? "Validated" : (vmName ? "Not Found" : "Not Checked"),
            totalPoints
        };

        if (resourceGroupDetails) {
            response.resourceGroupDetails = resourceGroupDetails;
        }

        if (vmDetails) {
            response.vmDetails = {
                name: vmDetails.name,
                osType: vmDetails.storageProfile.osDisk.osType,
                vmSize: vmDetails.hardwareProfile.vmSize
            };
        }

        // Return the response
        context.res = {
            status: 200,
            body: response
        };

    } catch (error) {
        context.log("Error:", error);
        context.res = {
            status: 500,
            body: `Error: ${error.message}`
        };
    }
};
