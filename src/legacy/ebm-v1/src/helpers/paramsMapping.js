const axios = require('axios');
const readQdmQuery = process.env.ADAPTER_URL;
const clientdbName = process.env.CLIENT_DB_NAME;

const getParamsFromDb = async (code) => {
    const payload = {
        db_name: clientdbName,
        filter: {
            paracode: code,
        },
        queryid: '5cd5f97f-53d3-4ef0-94eb-e8391f00f589',
    };

    try {
        const response = await axios.post(
            readQdmQuery + "read_qdmqueries",
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data?.[0]?.paraobj?.[0];
    } catch (error) {
        console.error('Error fetching params:', error.message);
        return null;
    }
};

module.exports = {
    getParamsFromDb,
};
